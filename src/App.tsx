import React, { useState, useRef, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { check as checkUpdate } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { 
  Camera, 
  Compass, 
  Square, 
  Play, 
  Pause, 
  Folder, 
  Columns, 
  Type, 
  MoveUpRight, 
  Minus, 
  PenTool, 
  Trash2, 
  Edit2, 
  Check, 
  VideoOff, 
  RefreshCw, 
  Mail, 
  Undo2,
  Settings,
  UploadCloud,
  FolderOpen,
  X,
  Camera as SnapshotIcon,
  Download,
  ExternalLink,
  Grid
} from "lucide-react";

type PrimaryMode = "capture" | "analysis";
type Tool = "angle" | "line" | "arrow" | "freehand" | "text";

interface Point {
  x: number;
  y: number;
}

interface Annotation {
  id: string;
  type: Tool;
  points: Point[];
  text?: string;
  angleValue?: number;
}

interface SavedRecording {
  id: string;
  name: string;
  url: string;
  blob?: Blob;
  diskPath?: string;
  timestamp: Date;
}

const PEAK_GREEN = "#009456";
const DB_NAME = "PeakPodiatryGaitDB";
const STORE_NAME = "recordings";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function persistRecording(id: string, name: string, blob: Blob, diskPath: string, timestamp: Date) {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.put({ id, name, blob, diskPath, timestamp: timestamp.toISOString() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function fetchPersistedRecordings(): Promise<SavedRecording[]> {
  const db = await openDB();
  return new Promise<SavedRecording[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => {
      const records = request.result.map((item: any) => ({
        id: item.id,
        name: item.name,
        blob: item.blob,
        diskPath: item.diskPath,
        url: URL.createObjectURL(item.blob),
        timestamp: new Date(item.timestamp),
      }));
      resolve(records.reverse());
    };
    request.onerror = () => reject(request.error);
  });
}

async function deletePersistedRecording(id: string) {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export default function App() {
  const [primaryMode, setPrimaryMode] = useState<PrimaryMode>("capture");
  const [activeTool, setActiveTool] = useState<Tool>("angle");
  const [showPlumbGrid, setShowPlumbGrid] = useState(false);
  
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [namingPrefix, setNamingPrefix] = useState("Patient_Trial");
  const [preferredFrameRate, setPreferredFrameRate] = useState("60");
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  
  const [videoStoragePath, setVideoStoragePath] = useState("C:\\Users\\Public\\Videos\\GaitVideos");
  const [stillsStoragePath, setStillsStoragePath] = useState("C:\\Users\\Public\\Pictures\\GaitStills");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [recordings, setRecordings] = useState<SavedRecording[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");

  const [availableDevices, setAvailableDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [isRecording, setIsRecording] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraErrorMsg, setCameraErrorMsg] = useState<string | null>(null);

  const [activeClipA, setActiveClipA] = useState<string | null>(null);
  const [activeClipB, setActiveClipB] = useState<string | null>(null);
  const [activeClipName, setActiveClipName] = useState<string>("Trial_01");
  const [isRenamingActive, setIsRenamingActive] = useState(false);
  const [dualMode, setDualMode] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [syncOffset, setSyncOffset] = useState(0);

  // Background Auto-Update on Application Startup
  useEffect(() => {
    const runSilentUpdate = async () => {
      try {
        const update = await checkUpdate();
        if (update?.available) {
          showToast(`Updating to v${update.version}...`);
          await update.downloadAndInstall();
          await relaunch();
        }
      } catch (err) {
        // Log in background; avoid disrupting active clinical workflow
        console.warn("Silent background update check:", err);
      }
    };
    runSilentUpdate();
  }, []);

  const [annotationsA, setAnnotationsA] = useState<Annotation[]>([]);
  const [annotationsB, setAnnotationsB] = useState<Annotation[]>([]);
  const [currentPointsA, setCurrentPointsA] = useState<Point[]>([]);
  const [currentPointsB, setCurrentPointsB] = useState<Point[]>([]);
  const [mousePosA, setMousePosA] = useState<Point | null>(null);
  const [mousePosB, setMousePosB] = useState<Point | null>(null);
  const [isMouseDownA, setIsMouseDownA] = useState(false);
  const [isMouseDownB, setIsMouseDownB] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoLiveRef = useRef<HTMLVideoElement | null>(null);
  const videoARef = useRef<HTMLVideoElement | null>(null);
  const videoBRef = useRef<HTMLVideoElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  
  const canvasARef = useRef<HTMLCanvasElement | null>(null);
  const containerARef = useRef<HTMLDivElement | null>(null);
  const canvasBRef = useRef<HTMLCanvasElement | null>(null);
  const containerBRef = useRef<HTMLDivElement | null>(null);

  const isSeekingRef = useRef(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 5000);
  };

  const handleOpenFolder = async (folder: string) => {
    try {
      await invoke("open_in_explorer", { folderPath: folder });
      showToast(`Opened ${folder} in File Explorer`);
    } catch (err: any) {
      alert(`Could not launch File Explorer: ${err}`);
    }
  };

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    try {
      const update = await checkUpdate();
      if (update?.available) {
        showToast(`Downloading update v${update.version}...`);
        await update.downloadAndInstall();
        showToast("Update installed successfully. Relaunching application...");
        await relaunch();
      } else {
        showToast("Application is on the latest version.");
      }
    } catch (err: any) {
      showToast(`Update check failed: ${err}`);
    } finally {
      setCheckingUpdate(false);
    }
  };

  useEffect(() => {
    fetchPersistedRecordings().then((saved) => {
      setRecordings(saved);
      if (saved.length > 0) {
        setActiveClipA(saved[0].url);
        setActiveClipName(saved[0].name);
      }
    });
  }, []);

  const syncCanvasDimensions = useCallback(() => {
    if (canvasARef.current && containerARef.current) {
      canvasARef.current.width = containerARef.current.clientWidth;
      canvasARef.current.height = containerARef.current.clientHeight;
    }
    if (canvasBRef.current && containerBRef.current) {
      canvasBRef.current.width = containerBRef.current.clientWidth;
      canvasBRef.current.height = containerBRef.current.clientHeight;
    }
  }, []);

  useEffect(() => {
    syncCanvasDimensions();
    window.addEventListener("resize", syncCanvasDimensions);
    return () => window.removeEventListener("resize", syncCanvasDimensions);
  }, [syncCanvasDimensions, primaryMode, dualMode]);

  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then((devices) => {
      const videoInputs = devices.filter((d) => d.kind === "videoinput");
      setAvailableDevices(videoInputs);
      if (videoInputs.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(videoInputs[0].deviceId);
      }
    });
  }, [selectedDeviceId]);

  const startCamera = useCallback(async () => {
    setCameraErrorMsg(null);
    try {
      if (videoLiveRef.current && videoLiveRef.current.srcObject) {
        (videoLiveRef.current.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
      }

      const constraints: MediaStreamConstraints = {
        video: selectedDeviceId 
          ? { deviceId: { exact: selectedDeviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
          : { width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (videoLiveRef.current) {
        videoLiveRef.current.srcObject = stream;
        await videoLiveRef.current.play();
      }
      setCameraActive(true);
    } catch {
      setCameraActive(false);
      setCameraErrorMsg("No camera detected. Connect capture card/webcam and select from settings.");
    }
  }, [selectedDeviceId]);

  useEffect(() => {
    if (primaryMode === "capture") {
      startCamera();
    }
  }, [primaryMode, startCamera]);

  const handleUndo = useCallback(() => {
    setAnnotationsA((prev) => prev.slice(0, -1));
    setAnnotationsB((prev) => prev.slice(0, -1));
    setCurrentPointsA([]);
    setCurrentPointsB([]);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        handleUndo();
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        if (primaryMode === "capture") {
          toggleRecording();
        } else {
          togglePlayback();
        }
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        stepFrames(-1);
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        stepFrames(1);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [primaryMode, isRecording, isPlaying, currentTime, handleUndo]);

  const toggleRecording = () => {
    if (!isRecording) {
      if (!videoLiveRef.current || !videoLiveRef.current.srcObject) return;
      const stream = videoLiveRef.current.srcObject as MediaStream;
      recordedChunksRef.current = [];
      
      const mime = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp8", "video/webm"].find((m) =>
        MediaRecorder.isTypeSupported(m)
      ) || "";

      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const ext = mime.includes("mp4") ? "mp4" : "webm";
        const blob = new Blob(recordedChunksRef.current, { type: mime || "video/mp4" });
        const url = URL.createObjectURL(blob);
        const now = new Date();
        const dateStr = now.toISOString().split("T")[0];
        const timeStr = now.toTimeString().split(" ")[0].replace(/:/g, "-");
        const filename = `${namingPrefix}_${dateStr}_${timeStr}.${ext}`;
        const newId = Date.now().toString();

        let diskSaved = false;
        try {
          const b64 = await blobToBase64(blob);
          await invoke("save_file_to_disk", {
            base64Data: b64,
            targetDir: videoStoragePath,
            filename: filename,
          });
          diskSaved = true;
        } catch (err) {
          console.error("Save to disk failed:", err);
          const dl = document.createElement("a");
          dl.href = url;
          dl.download = filename;
          dl.click();
        }

        const fullDiskPath = `${videoStoragePath}\\${filename}`;
        await persistRecording(newId, filename.replace(/\.[^/.]+$/, ""), blob, fullDiskPath, now);

        const newRec: SavedRecording = {
          id: newId,
          name: filename.replace(/\.[^/.]+$/, ""),
          url,
          blob,
          diskPath: fullDiskPath,
          timestamp: now,
        };

        setRecordings((prev) => [newRec, ...prev]);
        setActiveClipA(url);
        setActiveClipName(newRec.name);
        
        // Always reset to single-screen view on new capture completion
        setDualMode(false);
        setPrimaryMode("analysis");
        setAnnotationsA([]);
        setAnnotationsB([]);

        showToast(diskSaved ? `Saved directly to ${fullDiskPath}` : `Saved ${filename} to Downloads`);
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } else {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      setIsRecording(false);
    }
  };

  const handleImportVideo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    const cleanName = file.name.replace(/\.[^/.]+$/, "");
    const newId = Date.now().toString();
    const now = new Date();

    await persistRecording(newId, cleanName, file, "Imported", now);

    const newRec: SavedRecording = {
      id: newId,
      name: cleanName,
      url,
      blob: file,
      timestamp: now,
    };

    setRecordings((prev) => [newRec, ...prev]);
    setActiveClipA(url);
    setActiveClipName(cleanName);
    setDualMode(false);
    setPrimaryMode("analysis");
    setAnnotationsA([]);
    setAnnotationsB([]);
    
    if (videoARef.current) videoARef.current.load();
    setTimeout(syncCanvasDimensions, 100);
    showToast(`Loaded ${cleanName}`);
  };

  const handleDeleteRecording = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await deletePersistedRecording(id);
    setRecordings((prev) => prev.filter((r) => r.id !== id));
    if (activeClipA && recordings.find((r) => r.id === id)?.url === activeClipA) {
      setActiveClipA(null);
    }
    if (activeClipB && recordings.find((r) => r.id === id)?.url === activeClipB) {
      setActiveClipB(null);
      setDualMode(false);
    }
    showToast("Recording removed from library");
  };

  const stepFrames = (frames: number) => {
    if (primaryMode !== "analysis") return;
    if (videoARef.current) {
      videoARef.current.pause();
      setIsPlaying(false);
      const delta = frames * (1 / 60);
      const targetTime = Math.max(0, Math.min(videoARef.current.duration || 1, videoARef.current.currentTime + delta));
      videoARef.current.currentTime = targetTime;
      setCurrentTime(targetTime);

      if (dualMode && videoBRef.current) {
        videoBRef.current.currentTime = Math.max(0, targetTime + syncOffset);
      }
    }
  };

  const handleScrubberChange = (val: number) => {
    setCurrentTime(val);
    if (!isSeekingRef.current && videoARef.current) {
      isSeekingRef.current = true;
      requestAnimationFrame(() => {
        const vA = videoARef.current;
        if (vA) {
          if (typeof (vA as any).fastSeek === "function") {
            (vA as any).fastSeek(val);
          } else {
            vA.currentTime = val;
          }
        }
        const vB = videoBRef.current;
        if (dualMode && vB) {
          const targetB = Math.max(0, val + syncOffset);
          if (typeof (vB as any).fastSeek === "function") {
            (vB as any).fastSeek(targetB);
          } else {
            vB.currentTime = targetB;
          }
        }
        isSeekingRef.current = false;
      });
    }
  };

  const togglePlayback = () => {
    if (!videoARef.current) return;
    if (isPlaying) {
      videoARef.current.pause();
      if (videoBRef.current) videoBRef.current.pause();
      setIsPlaying(false);
    } else {
      videoARef.current.playbackRate = playbackRate;
      videoARef.current.play().catch(() => {});
      if (dualMode && videoBRef.current) {
        videoBRef.current.playbackRate = playbackRate;
        videoBRef.current.play().catch(() => {});
      }
      setIsPlaying(true);
    }
  };

  const handleSpeedChange = (rate: number) => {
    setPlaybackRate(rate);
    if (videoARef.current) videoARef.current.playbackRate = rate;
    if (videoBRef.current) videoBRef.current.playbackRate = rate;
  };

  const exportSnapshot = async () => {
    if (!videoARef.current || !canvasARef.current) return;

    const vidA = videoARef.current;
    const canA = canvasARef.current;

    const exportCanvas = document.createElement("canvas");
    const ctx = exportCanvas.getContext("2d");
    if (!ctx) return;

    if (dualMode && videoBRef.current && canvasBRef.current) {
      const vidB = videoBRef.current;
      const canB = canvasBRef.current;

      const singleW = vidA.videoWidth || canA.width;
      const singleH = vidA.videoHeight || canA.height;

      exportCanvas.width = singleW * 2;
      exportCanvas.height = singleH;

      ctx.drawImage(vidA, 0, 0, singleW, singleH);
      ctx.drawImage(canA, 0, 0, singleW, singleH);

      ctx.drawImage(vidB, singleW, 0, singleW, singleH);
      ctx.drawImage(canB, singleW, 0, singleW, singleH);

      ctx.strokeStyle = "#444444";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(singleW, 0);
      ctx.lineTo(singleW, singleH);
      ctx.stroke();
    } else {
      exportCanvas.width = vidA.videoWidth || canA.width;
      exportCanvas.height = vidA.videoHeight || canA.height;
      ctx.drawImage(vidA, 0, 0, exportCanvas.width, exportCanvas.height);
      ctx.drawImage(canA, 0, 0, exportCanvas.width, exportCanvas.height);
    }

    const dataUrl = exportCanvas.toDataURL("image/png");
    const b64 = dataUrl.split(",")[1];
    const filename = `${activeClipName}_Still_${currentTime.toFixed(2)}s.png`;

    try {
      await invoke("save_file_to_disk", {
        base64Data: b64,
        targetDir: stillsStoragePath,
        filename: filename,
      });
      showToast(`Still saved directly to ${stillsStoragePath}\\${filename}`);
    } catch (err) {
      console.error(err);
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = filename;
      a.click();
      showToast(`Still downloaded to Downloads`);
    }
  };

  const setupCanvasInteraction = (
    canvasRefTarget: React.RefObject<HTMLCanvasElement | null>,
    isScreenA: boolean
  ) => {
    const setAnnotationsTarget = isScreenA ? setAnnotationsA : setAnnotationsB;
    const currentPointsTarget = isScreenA ? currentPointsA : currentPointsB;
    const setCurrentPointsTarget = isScreenA ? setCurrentPointsA : setCurrentPointsB;
    const setIsMouseDownTarget = isScreenA ? setIsMouseDownA : setIsMouseDownB;
    const setMousePosTarget = isScreenA ? setMousePosA : setMousePosB;

    const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRefTarget.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const pt: Point = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      setIsMouseDownTarget(true);

      if (activeTool === "text") {
        const label = prompt("Enter clinical observation:");
        if (label) {
          setAnnotationsTarget((prev) => [
            ...prev,
            { id: Date.now().toString(), type: "text", points: [pt], text: label },
          ]);
        }
        setIsMouseDownTarget(false);
      } else if (activeTool === "angle") {
        const nextPts = [...currentPointsTarget, pt];
        if (nextPts.length === 3) {
          const [p1, p2, p3] = nextPts;
          const v1 = { x: p1.x - p2.x, y: p1.y - p2.y };
          const v2 = { x: p3.x - p2.x, y: p3.y - p2.y };
          const dot = v1.x * v2.x + v1.y * v2.y;
          const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
          const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);
          const deg = (Math.acos(Math.max(-1, Math.min(1, dot / (mag1 * mag2)))) * 180) / Math.PI;

          setAnnotationsTarget((prev) => [
            ...prev,
            { id: Date.now().toString(), type: "angle", points: nextPts, angleValue: parseFloat(deg.toFixed(1)) },
          ]);
          setCurrentPointsTarget([]);
        } else {
          setCurrentPointsTarget(nextPts);
        }
        setIsMouseDownTarget(false);
      } else {
        setCurrentPointsTarget([pt, pt]);
      }
    };

    const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRefTarget.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const pt: Point = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      setMousePosTarget(pt);

      if (activeTool === "freehand") {
        if (isScreenA ? isMouseDownA : isMouseDownB) {
          setCurrentPointsTarget((prev) => [...prev, pt]);
        }
      } else if (activeTool === "line" || activeTool === "arrow") {
        if (isScreenA ? isMouseDownA : isMouseDownB) {
          setCurrentPointsTarget((prev) => [prev[0], pt]);
        }
      }
    };

    const onMouseUp = () => {
      setIsMouseDownTarget(false);
      if (activeTool === "line" || activeTool === "arrow") {
        if (currentPointsTarget.length === 2) {
          setAnnotationsTarget((prev) => [
            ...prev,
            { id: Date.now().toString(), type: activeTool, points: currentPointsTarget },
          ]);
        }
        setCurrentPointsTarget([]);
      } else if (activeTool === "freehand") {
        if (currentPointsTarget.length > 1) {
          setAnnotationsTarget((prev) => [
            ...prev,
            { id: Date.now().toString(), type: "freehand", points: currentPointsTarget },
          ]);
        }
        setCurrentPointsTarget([]);
      }
    };

    return { onMouseDown, onMouseMove, onMouseUp };
  };

  const handlersA = setupCanvasInteraction(canvasARef, true);
  const handlersB = setupCanvasInteraction(canvasBRef, false);

  const renderCanvas = (
    canvas: HTMLCanvasElement | null,
    annotationsList: Annotation[],
    inProgressPoints: Point[],
    hoverPos: Point | null
  ) => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Optional Plumbline Reference Grid
    if (showPlumbGrid) {
      ctx.strokeStyle = "rgba(0, 148, 86, 0.25)";
      ctx.lineWidth = 1;
      const step = 80;
      for (let x = step; x < canvas.width; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      // Central vertical plumb reference
      ctx.strokeStyle = "rgba(0, 230, 118, 0.5)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(canvas.width / 2, 0);
      ctx.lineTo(canvas.width / 2, canvas.height);
      ctx.stroke();
    }

    const renderPath = (pts: Point[], stroke = PEAK_GREEN, lineW = 3, dashed = false) => {
      if (pts.length < 2) return;
      ctx.beginPath();
      ctx.setLineDash(dashed ? [6, 4] : []);
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = lineW + 2;
      ctx.stroke();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineW;
      ctx.stroke();
      ctx.setLineDash([]);
    };

    const renderArrowHead = (from: Point, to: Point) => {
      const angle = Math.atan2(to.y - from.y, to.x - from.x);
      const headlen = 16;
      ctx.beginPath();
      ctx.moveTo(to.x, to.y);
      ctx.lineTo(to.x - headlen * Math.cos(angle - Math.PI / 6), to.y - headlen * Math.sin(angle - Math.PI / 6));
      ctx.moveTo(to.x, to.y);
      ctx.lineTo(to.x - headlen * Math.cos(angle + Math.PI / 6), to.y - headlen * Math.sin(angle + Math.PI / 6));
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.strokeStyle = PEAK_GREEN;
      ctx.lineWidth = 3;
      ctx.stroke();
    };

    annotationsList.forEach((ann) => {
      if (ann.type === "freehand" || ann.type === "line") {
        renderPath(ann.points);
      } else if (ann.type === "arrow") {
        renderPath(ann.points);
        renderArrowHead(ann.points[0], ann.points[1]);
      } else if (ann.type === "angle") {
        renderPath(ann.points);
        if (ann.angleValue !== undefined && ann.points[1]) {
          ctx.fillStyle = "#121212";
          ctx.strokeStyle = PEAK_GREEN;
          ctx.lineWidth = 1.5;
          const bx = ann.points[1].x + 14;
          const by = ann.points[1].y - 14;
          ctx.fillRect(bx - 4, by - 14, 58, 20);
          ctx.strokeRect(bx - 4, by - 14, 58, 20);
          ctx.fillStyle = PEAK_GREEN;
          ctx.font = "bold 13px monospace";
          ctx.fillText(`${ann.angleValue}°`, bx, by);
        }
      } else if (ann.type === "text" && ann.text && ann.points[0]) {
        ctx.fillStyle = "#000000";
        ctx.font = "bold 14px sans-serif";
        ctx.fillText(ann.text, ann.points[0].x + 1, ann.points[0].y + 1);
        ctx.fillStyle = PEAK_GREEN;
        ctx.fillText(ann.text, ann.points[0].x, ann.points[0].y);
      }
    });

    inProgressPoints.forEach((pt) => {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 5, 0, 2 * Math.PI);
      ctx.fillStyle = PEAK_GREEN;
      ctx.fill();
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 2;
      ctx.stroke();
    });

    if (inProgressPoints.length > 1) {
      renderPath(inProgressPoints);
      if (activeTool === "arrow") renderArrowHead(inProgressPoints[0], inProgressPoints[1]);
    }

    if (activeTool === "angle" && hoverPos) {
      if (inProgressPoints.length === 1) {
        renderPath([inProgressPoints[0], hoverPos], "#00E676", 2, true);
      } else if (inProgressPoints.length === 2) {
        renderPath([inProgressPoints[0], inProgressPoints[1]]);
        renderPath([inProgressPoints[1], hoverPos], "#00E676", 2, true);

        const v1 = { x: inProgressPoints[0].x - inProgressPoints[1].x, y: inProgressPoints[0].y - inProgressPoints[1].y };
        const v2 = { x: hoverPos.x - inProgressPoints[1].x, y: hoverPos.y - inProgressPoints[1].y };
        const dot = v1.x * v2.x + v1.y * v2.y;
        const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
        const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);
        const previewDeg = (Math.acos(Math.max(-1, Math.min(1, dot / (mag1 * mag2)))) * 180) / Math.PI;

        if (!isNaN(previewDeg)) {
          ctx.fillStyle = "#121212";
          ctx.strokeStyle = "#00E676";
          ctx.lineWidth = 1;
          const bx = inProgressPoints[1].x + 14;
          const by = inProgressPoints[1].y - 14;
          ctx.fillRect(bx - 4, by - 14, 62, 20);
          ctx.strokeRect(bx - 4, by - 14, 62, 20);
          ctx.fillStyle = "#00E676";
          ctx.font = "bold 13px monospace";
          ctx.fillText(`~${previewDeg.toFixed(1)}°`, bx, by);
        }
      }
    }
  };

  useEffect(() => {
    renderCanvas(canvasARef.current, annotationsA, currentPointsA, mousePosA);
  }, [annotationsA, currentPointsA, mousePosA, activeTool, showPlumbGrid]);

  useEffect(() => {
    if (dualMode) {
      renderCanvas(canvasBRef.current, annotationsB, currentPointsB, mousePosB);
    }
  }, [annotationsB, currentPointsB, mousePosB, activeTool, dualMode, showPlumbGrid]);

  const sendEmailReport = async () => {
    const angleList = [...annotationsA, ...annotationsB]
      .filter((a) => a.type === "angle" && a.angleValue !== undefined)
      .map((a) => `• Angle: ${a.angleValue}°`)
      .join("\n");

    const notes = [...annotationsA, ...annotationsB]
      .filter((a) => a.type === "text" && a.text)
      .map((a) => `• Note: ${a.text}`)
      .join("\n");

    const bodyContent = `PEAK PODIATRY CLINICAL GAIT REPORT\n` +
      `---------------------------------\n` +
      `Trial: ${activeClipName}\n` +
      `Date: ${new Date().toLocaleDateString("en-GB")}\n` +
      `Duration: ${duration.toFixed(2)}s\n\n` +
      `MEASUREMENTS:\n` +
      `${angleList || "None recorded."}\n\n` +
      `CLINICAL OBSERVATIONS:\n` +
      `${notes || "None."}\n\n` +
      `Files saved to: ${videoStoragePath} and ${stillsStoragePath}\n` +
      `Recorded via Peak Podiatry +One Gait Lab.`;

    await navigator.clipboard.writeText(bodyContent);
    await exportSnapshot();

    const subject = encodeURIComponent(`Peak Podiatry Gait Report - ${activeClipName}`);
    const mailtoUri = `mailto:?subject=${subject}&body=${encodeURIComponent(bodyContent)}`;
    const anchor = document.createElement("a");
    anchor.href = mailtoUri;
    anchor.click();

    try {
      await invoke("open_in_explorer", { folderPath: stillsStoragePath });
    } catch {}

    showToast("Report copied to clipboard. Stills folder opened in Explorer.");
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[#121212] text-gray-100 font-sans select-none overflow-hidden">
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleImportVideo} 
        accept="video/*" 
        className="hidden" 
      />

      {/* Header - Distinct Branding Lockup */}
      <header className="relative flex items-center justify-between px-6 py-2 bg-[#161616] border-b border-[#262626] z-30">
        <div className="flex items-center gap-3.5 z-10">
          <img 
            src="/peak-logo.png" 
            alt="Peak Podiatry" 
            className="h-7 w-auto object-contain [image-rendering:crisp-edges]" 
          />
          <div className="h-5 w-[1px] bg-gray-700" />
          <img 
            src="/plus-one-logo.png" 
            alt="+One" 
            className="h-7 w-auto object-contain [image-rendering:crisp-edges]" 
          />
        </div>

        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 z-20">
          <button
            onClick={() => setPrimaryMode("capture")}
            className={`flex items-center gap-2 px-6 py-2 rounded font-bold text-xs uppercase tracking-wider transition cursor-pointer ${
              primaryMode === "capture" ? "bg-[#009456] text-white shadow-[0_0_12px_rgba(0,148,86,0.4)]" : "bg-[#252525] text-gray-400 hover:text-white"
            }`}
          >
            <Camera className="w-4 h-4" /> Capture
          </button>
          <button
            onClick={() => {
              setPrimaryMode("analysis");
              setTimeout(syncCanvasDimensions, 50);
            }}
            className={`flex items-center gap-2 px-6 py-2 rounded font-bold text-xs uppercase tracking-wider transition cursor-pointer ${
              primaryMode === "analysis" ? "bg-[#009456] text-white shadow-[0_0_12px_rgba(0,148,86,0.4)]" : "bg-[#252525] text-gray-400 hover:text-white"
            }`}
          >
            <Compass className="w-4 h-4" /> Analysis
          </button>
        </div>

        <div className="flex items-center gap-2.5 z-10">
          <button
            onClick={() => handleOpenFolder(videoStoragePath)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#202020] hover:bg-[#282828] text-xs text-gray-200 border border-[#333333] cursor-pointer"
            title="Open Video Folder in File Explorer"
          >
            <FolderOpen className="w-3.5 h-3.5 text-[#009456]" /> Videos
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#202020] hover:bg-[#282828] text-xs text-gray-200 border border-[#333333] cursor-pointer"
            title="Import an existing video from disk"
          >
            <UploadCloud className="w-3.5 h-3.5 text-[#009456]" /> Import
          </button>

          <button
            onClick={handleCheckUpdate}
            disabled={checkingUpdate}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#202020] hover:bg-[#282828] text-xs text-gray-200 border border-[#333333] cursor-pointer"
            title="Check for software updates from GitHub"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#009456] ${checkingUpdate ? "animate-spin" : ""}`} />
            {checkingUpdate ? "Checking..." : "Update"}
          </button>

          <button
            onClick={() => setDrawerOpen(!drawerOpen)}
            className="flex items-center gap-2 px-3 py-1.5 rounded bg-[#202020] hover:bg-[#282828] text-xs text-gray-200 border border-[#333333] cursor-pointer"
          >
            <Folder className="w-3.5 h-3.5 text-[#009456]" /> Library ({recordings.length})
          </button>
        </div>
      </header>

      {/* Main Viewport Container */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* Drawer */}
        <div
          className={`absolute left-0 top-0 bottom-0 w-84 bg-[#161616] border-r border-[#282828] z-40 transition-transform duration-300 flex flex-col ${
            drawerOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between p-4 border-b border-[#282828]">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400">Captured Trials</h2>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => handleOpenFolder(videoStoragePath)} 
                title="Open Saved Videos in File Explorer"
                className="text-gray-400 hover:text-[#009456] p-1 cursor-pointer"
              >
                <FolderOpen className="w-4 h-4" />
              </button>
              <button onClick={() => setDrawerOpen(false)} className="text-gray-400 hover:text-white text-xs cursor-pointer">✕</button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {recordings.length === 0 ? (
              <p className="text-xs text-gray-600 text-center py-8">No recordings captured or imported yet.</p>
            ) : (
              recordings.map((rec) => (
                <div 
                  key={rec.id} 
                  className="p-3 bg-[#202020] hover:bg-[#242424] rounded border border-gray-800 flex flex-col gap-2 transition"
                >
                  <div className="flex items-center justify-between">
                    {editingId === rec.id ? (
                      <div className="flex items-center gap-1 flex-1 mr-2">
                        <input
                          type="text"
                          value={renameText}
                          onChange={(e) => setRenameText(e.target.value)}
                          className="w-full bg-[#121212] text-xs px-2 py-0.5 rounded border border-[#009456] text-white"
                        />
                        <button
                          onClick={async () => {
                            if (rec.blob) {
                              await persistRecording(rec.id, renameText, rec.blob, rec.diskPath || "", rec.timestamp);
                            }
                            setRecordings((prev) => prev.map((r) => (r.id === rec.id ? { ...r, name: renameText } : r)));
                            if (activeClipA === rec.url) setActiveClipName(renameText);
                            setEditingId(null);
                          }}
                          className="text-[#009456]"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs font-bold text-gray-200 truncate">{rec.name}</span>
                    )}
                    <div className="flex items-center gap-1">
                      <button 
                        onClick={() => {
                          const a = document.createElement("a");
                          a.href = rec.url;
                          a.download = `${rec.name}.mp4`;
                          a.click();
                          showToast(`Exported ${rec.name}.mp4`);
                        }} 
                        className="text-gray-500 hover:text-[#009456] p-1 cursor-pointer"
                        title="Download/Export File"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => { setEditingId(rec.id); setRenameText(rec.name); }} className="text-gray-500 hover:text-white p-1 cursor-pointer">
                        <Edit2 className="w-3 h-3" />
                      </button>
                      <button onClick={(e) => handleDeleteRecording(rec.id, e)} className="text-gray-500 hover:text-red-400 p-1 cursor-pointer">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-gray-800/60">
                    <span className="text-[10px] text-gray-500 font-mono">{rec.timestamp.toLocaleTimeString("en-GB")}</span>
                    
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => {
                          setActiveClipA(rec.url);
                          setActiveClipName(rec.name);
                          setPrimaryMode("analysis");
                          if (videoARef.current) videoARef.current.load();
                          setTimeout(syncCanvasDimensions, 50);
                          showToast(`Loaded "${rec.name}" to Left screen`);
                        }}
                        className="px-2.5 py-1 rounded bg-[#2b2b2b] hover:bg-[#009456] text-gray-200 hover:text-white text-[11px] font-bold cursor-pointer transition"
                      >
                        Left
                      </button>
                      <button
                        onClick={() => {
                          setActiveClipB(rec.url);
                          setDualMode(true);
                          setPrimaryMode("analysis");
                          if (videoBRef.current) videoBRef.current.load();
                          setTimeout(syncCanvasDimensions, 50);
                          showToast(`Loaded "${rec.name}" to Right screen`);
                        }}
                        className="px-2.5 py-1 rounded bg-[#2b2b2b] hover:bg-[#009456] text-gray-200 hover:text-white text-[11px] font-bold cursor-pointer transition"
                      >
                        Right
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Viewport Canvas */}
        <main className="relative flex-1 bg-black flex items-center justify-center overflow-hidden">
          {primaryMode === "capture" ? (
            <div className="relative w-full h-full flex items-center justify-center">
              <video 
                ref={videoLiveRef} 
                autoPlay 
                playsInline 
                muted 
                className="w-full h-full object-contain" 
              />
              {isRecording && (
                <div className="absolute top-6 left-6 flex items-center gap-2 bg-black/80 px-4 py-2 rounded-full border border-red-500/50">
                  <span className="w-3 h-3 rounded-full bg-red-500 animate-ping" />
                  <span className="text-xs font-bold text-red-400 tracking-wider">RECORDING RUN</span>
                </div>
              )}
              {!cameraActive && (
                <div className="absolute flex flex-col items-center gap-3 bg-[#1e1e1e] p-6 rounded-lg border border-[#2a2a2a] text-center max-w-md">
                  <VideoOff className="w-8 h-8 text-gray-400" />
                  <p className="text-xs text-gray-400">{cameraErrorMsg || "Camera feed initializing..."}</p>
                  <button
                    onClick={startCamera}
                    className="flex items-center gap-2 px-4 py-2 bg-[#2a2a2a] hover:bg-[#333333] text-[#009456] text-xs rounded border border-[#009456]/40 font-semibold cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Retry Camera Feed
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="relative w-full h-full flex">
              {/* Screen A */}
              <div 
                ref={containerARef} 
                className="relative flex-1 h-full flex items-center justify-center bg-black"
              >
                <video
                  ref={videoARef}
                  src={activeClipA || ""}
                  playsInline
                  muted
                  preload="auto"
                  onTimeUpdate={() => {
                    if (videoARef.current && !isSeekingRef.current) {
                      setCurrentTime(videoARef.current.currentTime);
                    }
                  }}
                  onLoadedMetadata={() => {
                    if (videoARef.current) {
                      setDuration(videoARef.current.duration);
                      syncCanvasDimensions();
                    }
                  }}
                  className="w-full h-full object-contain pointer-events-none"
                />
                <canvas
                  ref={canvasARef}
                  onMouseDown={handlersA.onMouseDown}
                  onMouseMove={handlersA.onMouseMove}
                  onMouseUp={handlersA.onMouseUp}
                  className="absolute inset-0 w-full h-full cursor-crosshair z-20"
                />
                <div className="absolute top-3 left-3 bg-black/60 px-2 py-0.5 rounded text-[10px] text-gray-400 border border-gray-800">
                  LEFT (PRIMARY)
                </div>
              </div>

              {/* Screen B */}
              {dualMode && (
                <div 
                  ref={containerBRef} 
                  className="relative flex-1 h-full border-l border-[#282828] flex items-center justify-center bg-black"
                >
                  <video
                    ref={videoBRef}
                    src={activeClipB || ""}
                    playsInline
                    muted
                    preload="auto"
                    className="w-full h-full object-contain pointer-events-none"
                  />
                  <canvas
                    ref={canvasBRef}
                    onMouseDown={handlersB.onMouseDown}
                    onMouseMove={handlersB.onMouseMove}
                    onMouseUp={handlersB.onMouseUp}
                    className="absolute inset-0 w-full h-full cursor-crosshair z-20"
                  />
                  <div className="absolute top-3 left-3 bg-black/60 px-2 py-0.5 rounded text-[10px] text-gray-400 border border-gray-800">
                    RIGHT (SPLIT)
                  </div>
                  <button
                    onClick={() => setDualMode(false)}
                    className="absolute top-3 right-3 bg-black/70 text-gray-400 hover:text-white px-2 py-0.5 rounded text-xs cursor-pointer z-30"
                  >
                    ✕ Close
                  </button>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Settings Modal */}
      {settingsOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center z-50">
          <div className="bg-[#1c1c1c] border border-[#2e2e2e] rounded-lg w-96 p-5 flex flex-col gap-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#282828] pb-3">
              <h3 className="text-sm font-bold tracking-wide text-gray-200 uppercase flex items-center gap-2">
                <Settings className="w-4 h-4 text-[#009456]" /> Device & Storage Settings
              </h3>
              <button onClick={() => setSettingsOpen(false)} className="text-gray-400 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col gap-4">
              <div>
                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                  Active Video Capture Device
                </label>
                <select
                  value={selectedDeviceId}
                  onChange={(e) => setSelectedDeviceId(e.target.value)}
                  style={{ WebkitAppearance: "none", appearance: "none" }}
                  className="w-full bg-[#121212] border border-[#333333] rounded px-3 py-2 text-xs text-white outline-none cursor-pointer"
                >
                  {availableDevices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId} className="bg-[#181818] text-white">
                      {d.label || `Camera ${d.deviceId.slice(0, 5)}`}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                  Target Framerate
                </label>
                <select
                  value={preferredFrameRate}
                  onChange={(e) => setPreferredFrameRate(e.target.value)}
                  style={{ WebkitAppearance: "none", appearance: "none" }}
                  className="w-full bg-[#121212] border border-[#333333] rounded px-3 py-2 text-xs text-white outline-none cursor-pointer"
                >
                  <option value="60" className="bg-[#181818] text-white">60 FPS (Clinical Standard)</option>
                  <option value="120" className="bg-[#181818] text-white">120 FPS (High Speed Running)</option>
                  <option value="30" className="bg-[#181818] text-white">30 FPS (Low Latency)</option>
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                    Video Directory (SSD)
                  </label>
                  <button 
                    onClick={() => handleOpenFolder(videoStoragePath)} 
                    className="text-[11px] text-[#009456] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <ExternalLink className="w-3 h-3" /> View in Explorer
                  </button>
                </div>
                <input
                  type="text"
                  value={videoStoragePath}
                  onChange={(e) => setVideoStoragePath(e.target.value)}
                  className="w-full bg-[#121212] border border-[#333333] rounded px-3 py-1.5 text-xs text-white outline-none"
                  placeholder="C:\Users\Public\Videos\GaitVideos"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                    Stills / Pictures Directory (SSD)
                  </label>
                  <button 
                    onClick={() => handleOpenFolder(stillsStoragePath)} 
                    className="text-[11px] text-[#009456] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <ExternalLink className="w-3 h-3" /> View in Explorer
                  </button>
                </div>
                <input
                  type="text"
                  value={stillsStoragePath}
                  onChange={(e) => setStillsStoragePath(e.target.value)}
                  className="w-full bg-[#121212] border border-[#333333] rounded px-3 py-1.5 text-xs text-white outline-none"
                  placeholder="C:\Users\Public\Pictures\GaitStills"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                  Default File Prefix
                </label>
                <input
                  type="text"
                  value={namingPrefix}
                  onChange={(e) => setNamingPrefix(e.target.value)}
                  className="w-full bg-[#121212] border border-[#333333] rounded px-3 py-1.5 text-xs text-white outline-none"
                  placeholder="Patient_Trial"
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => {
                  setSettingsOpen(false);
                  if (primaryMode === "capture") startCamera();
                }}
                className="px-4 py-1.5 rounded bg-[#009456] hover:bg-[#007a46] text-white font-bold text-xs cursor-pointer"
              >
                Save & Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer Controls */}
      <footer className="px-6 py-3 bg-[#181818] border-t border-[#282828] z-30">
        {primaryMode === "capture" ? (
          /* Perfectly Centered Capture Controls */
          <div className="relative flex items-center justify-between w-full">
            <button
              onClick={() => setSettingsOpen(true)}
              className="p-2 rounded bg-[#222222] hover:bg-[#2c2c2c] text-gray-300 hover:text-white border border-[#333333] cursor-pointer"
              title="Lab & Camera Settings"
            >
              <Settings className="w-4 h-4 text-[#009456]" />
            </button>

            <div className="absolute left-1/2 -translate-x-1/2">
              <button
                onClick={toggleRecording}
                className={`flex items-center gap-2 px-10 py-2.5 rounded font-bold text-xs uppercase tracking-wider transition cursor-pointer shadow-lg ${
                  isRecording ? "bg-red-600 hover:bg-red-700 text-white" : "bg-[#009456] hover:bg-[#007a46] text-white"
                }`}
              >
                {isRecording ? <Square className="w-4 h-4 fill-white" /> : <Camera className="w-4 h-4" />}
                {isRecording ? "Stop & Analyse" : "Start Capture"}
              </button>
            </div>

            <div className="w-10" />
          </div>
        ) : (
          /* Analysis Control Layout */
          <div className="flex flex-col gap-2.5">
            {/* Timeline Scrubber */}
            <div className="relative flex items-center gap-4 w-full">
              <span className="text-xs font-mono text-gray-400 w-14">{currentTime.toFixed(2)}s</span>
              
              <div className="relative flex-1 flex items-center h-6">
                <input
                  type="range"
                  min={0}
                  max={duration || 1}
                  step={0.001}
                  value={currentTime}
                  onChange={(e) => handleScrubberChange(parseFloat(e.target.value))}
                  className="w-full accent-[#009456] h-1.5 bg-[#252525] rounded cursor-pointer z-10"
                />
              </div>

              <span className="text-xs font-mono text-gray-400 w-14 text-right">{duration.toFixed(2)}s</span>
            </div>

            {/* Bottom 3-Zone Toolbar */}
            <div className="relative flex items-center justify-between w-full">
              {/* Zone 1 (Left): Settings Cog & Measurement Toolset */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSettingsOpen(true)}
                  className="p-2 rounded bg-[#202020] hover:bg-[#2c2c2c] text-gray-300 hover:text-white border border-[#2e2e2e] cursor-pointer"
                  title="Lab & Camera Settings"
                >
                  <Settings className="w-4 h-4 text-[#009456]" />
                </button>

                <div className="flex items-center gap-1 bg-[#202020] p-1 rounded border border-[#2e2e2e]">
                  <button
                    onClick={() => setActiveTool("angle")}
                    className={`p-1.5 rounded cursor-pointer ${activeTool === "angle" ? "bg-[#009456] text-white" : "text-gray-400 hover:text-white"}`}
                    title="Protractor Angle (Default)"
                  >
                    <Compass className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setActiveTool("arrow")}
                    className={`p-1.5 rounded cursor-pointer ${activeTool === "arrow" ? "bg-[#009456] text-white" : "text-gray-400 hover:text-white"}`}
                    title="Directed Vector Arrow"
                  >
                    <MoveUpRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setActiveTool("line")}
                    className={`p-1.5 rounded cursor-pointer ${activeTool === "line" ? "bg-[#009456] text-white" : "text-gray-400 hover:text-white"}`}
                    title="Straight Reference Line"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setActiveTool("freehand")}
                    className={`p-1.5 rounded cursor-pointer ${activeTool === "freehand" ? "bg-[#009456] text-white" : "text-gray-400 hover:text-white"}`}
                    title="Freehand Pen"
                  >
                    <PenTool className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setActiveTool("text")}
                    className={`p-1.5 rounded cursor-pointer ${activeTool === "text" ? "bg-[#009456] text-white" : "text-gray-400 hover:text-white"}`}
                    title="Clinical Text Observation"
                  >
                    <Type className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setShowPlumbGrid(!showPlumbGrid)}
                    className={`p-1.5 rounded cursor-pointer ${showPlumbGrid ? "bg-[#009456] text-white" : "text-gray-400 hover:text-white"}`}
                    title="Toggle True Vertical Plumb Line Grid"
                  >
                    <Grid className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleUndo}
                    className="p-1.5 rounded text-gray-400 hover:text-[#009456] cursor-pointer ml-1"
                    title="Undo (Ctrl + Z)"
                  >
                    <Undo2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      setAnnotationsA([]);
                      setAnnotationsB([]);
                    }}
                    className="p-1.5 rounded text-gray-500 hover:text-red-400 cursor-pointer ml-1"
                    title="Clear All Annotations"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Trial Title Input */}
                <div className="flex items-center gap-2 bg-[#202020] px-3 py-1 rounded border border-[#2e2e2e] ml-1">
                  <span className="text-[10px] text-gray-500 uppercase font-mono">TRIAL:</span>
                  {isRenamingActive ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={activeClipName}
                        onChange={(e) => setActiveClipName(e.target.value)}
                        className="bg-[#121212] text-xs px-2 py-0.5 rounded border border-[#009456] text-white outline-none"
                      />
                      <button onClick={() => setIsRenamingActive(false)} className="text-[#009456] cursor-pointer">
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 cursor-pointer" onClick={() => setIsRenamingActive(true)}>
                      <span className="text-xs font-bold text-gray-200">{activeClipName}</span>
                      <Edit2 className="w-3 h-3 text-gray-500 hover:text-white" />
                    </div>
                  )}
                </div>
              </div>

              {/* Zone 2 (Centre): Play/Pause Focus */}
              <div className="absolute left-1/2 -translate-x-1/2">
                <button
                  onClick={togglePlayback}
                  className="px-6 py-2 rounded bg-[#009456] text-white font-bold text-xs flex items-center gap-2 cursor-pointer hover:bg-[#007a46] shadow-md transition"
                >
                  {isPlaying ? <Pause className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white" />}
                  {isPlaying ? "Pause" : "Play"}
                </button>
              </div>

              {/* Zone 3 (Right): Speeds, Stills, Report, and Dual View */}
              <div className="flex items-center gap-2.5">
                {/* Playback Speeds */}
                <div className="flex items-center gap-1 bg-[#202020] p-1 rounded border border-[#2e2e2e]">
                  {[0.25, 0.5, 1.0].map((rate) => (
                    <button
                      key={rate}
                      onClick={() => handleSpeedChange(rate)}
                      className={`px-2.5 py-1 rounded text-[11px] font-mono cursor-pointer transition ${
                        playbackRate === rate ? "bg-[#009456] text-white font-bold" : "text-gray-400 hover:text-white"
                      }`}
                    >
                      {rate}x
                    </button>
                  ))}
                </div>

                <button
                  onClick={exportSnapshot}
                  className="flex items-center gap-1 px-3 py-1.5 rounded bg-[#252525] hover:bg-[#303030] text-xs text-gray-300 border border-gray-700 cursor-pointer"
                  title="Capture Still with Measurements (Captures Dual View if active)"
                >
                  <SnapshotIcon className="w-3.5 h-3.5 text-[#009456]" /> Still
                </button>

                <button
                  onClick={sendEmailReport}
                  className="flex items-center gap-1 px-3 py-1.5 rounded bg-[#252525] hover:bg-[#303030] text-xs text-gray-300 border border-gray-700 cursor-pointer"
                  title="Copy Report to Clipboard, Save Still, and Open Stills Folder"
                >
                  <Mail className="w-3.5 h-3.5 text-[#009456]" /> Report
                </button>

                <button
                  onClick={() => {
                    if (!dualMode && recordings.length > 1) {
                      setActiveClipB(recordings[1].url);
                    }
                    setDualMode(!dualMode);
                    setTimeout(syncCanvasDimensions, 50);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold border transition cursor-pointer ${
                    dualMode ? "bg-[#009456] text-white border-[#009456]" : "bg-[#252525] text-gray-300 border-gray-700 hover:bg-[#303030]"
                  }`}
                >
                  <Columns className="w-3.5 h-3.5" /> Dual View
                </button>

                {dualMode && (
                  <div className="flex items-center gap-2 bg-[#202020] px-3 py-1 rounded border border-[#2e2e2e]">
                    <span 
                      onDoubleClick={() => setSyncOffset(0)}
                      title="Double-click to reset"
                      className="text-[10px] uppercase font-bold text-gray-400 cursor-pointer hover:text-white"
                    >
                      Sync:
                    </span>
                    <input
                      type="range"
                      min={-2}
                      max={2}
                      step={0.016}
                      value={syncOffset}
                      onDoubleClick={() => setSyncOffset(0)}
                      onChange={(e) => {
                        const off = parseFloat(e.target.value);
                        setSyncOffset(off);
                        if (videoBRef.current && videoARef.current) {
                          videoBRef.current.currentTime = Math.max(0, videoARef.current.currentTime + off);
                        }
                      }}
                      className="w-16 accent-[#009456] h-1 cursor-pointer"
                    />
                    <span className="text-[10px] font-mono text-[#009456] w-8">
                      {syncOffset > 0 ? `+${syncOffset.toFixed(2)}` : syncOffset.toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </footer>

      {/* Floating Clickable Alert Toast */}
      {toastMessage && (
        <div 
          onClick={() => {
            const folder = toastMessage.includes("Still") ? stillsStoragePath : videoStoragePath;
            handleOpenFolder(folder);
          }}
          title="Click to reveal folder in File Explorer"
          className="fixed bottom-16 right-6 bg-[#1a1a1a] hover:bg-[#252525] text-white text-xs px-4 py-2.5 rounded-lg border border-[#009456] shadow-2xl z-50 flex items-center gap-2.5 cursor-pointer transition select-none"
        >
          <div className="w-2 h-2 rounded-full bg-[#009456]" />
          <span>{toastMessage}</span>
          <span className="text-[11px] text-[#009456] underline font-bold ml-1">Open Folder ↗</span>
        </div>
      )}
    </div>
  );
}
