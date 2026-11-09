import React, { useState, useRef, useEffect, useCallback } from "react";
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
  Scissors, 
  Mail, 
  Undo2,
  Settings,
  UploadCloud,
  FolderOpen,
  X
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
  timestamp: Date;
}

const PEAK_GREEN = "#009456";

export default function App() {
  const [primaryMode, setPrimaryMode] = useState<PrimaryMode>("capture");
  const [activeTool, setActiveTool] = useState<Tool>("angle");
  
  // Settings & Configuration Modal
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [namingPrefix, setNamingPrefix] = useState("Trial");
  const [preferredFrameRate, setPreferredFrameRate] = useState("60");

  // Navigation & Drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [recordings, setRecordings] = useState<SavedRecording[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");

  // Video & Device State
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

  // In-Scrubber Trimming Markers
  const [trimIn, setTrimIn] = useState<number | null>(null);
  const [trimOut, setTrimOut] = useState<number | null>(null);

  // Dual Canvas Annotations
  const [annotationsA, setAnnotationsA] = useState<Annotation[]>([]);
  const [annotationsB, setAnnotationsB] = useState<Annotation[]>([]);
  const [currentPointsA, setCurrentPointsA] = useState<Point[]>([]);
  const [currentPointsB, setCurrentPointsB] = useState<Point[]>([]);
  const [mousePosA, setMousePosA] = useState<Point | null>(null);
  const [mousePosB, setMousePosB] = useState<Point | null>(null);
  const [isMouseDownA, setIsMouseDownA] = useState(false);
  const [isMouseDownB, setIsMouseDownB] = useState(false);

  // Hidden File Input
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // References
  const videoLiveRef = useRef<HTMLVideoElement | null>(null);
  const videoARef = useRef<HTMLVideoElement | null>(null);
  const videoBRef = useRef<HTMLVideoElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  
  const canvasARef = useRef<HTMLCanvasElement | null>(null);
  const containerARef = useRef<HTMLDivElement | null>(null);
  const canvasBRef = useRef<HTMLCanvasElement | null>(null);
  const containerBRef = useRef<HTMLDivElement | null>(null);

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
        const tracks = (videoLiveRef.current.srcObject as MediaStream).getTracks();
        tracks.forEach((track) => track.stop());
      }

      const constraints: MediaStreamConstraints = {
        video: selectedDeviceId 
          ? { deviceId: { exact: selectedDeviceId } }
          : true,
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (videoLiveRef.current) {
        videoLiveRef.current.srcObject = stream;
        await videoLiveRef.current.play();
      }
      setCameraActive(true);
    } catch (err: any) {
      setCameraActive(false);
      setCameraErrorMsg("Unable to stream video device. Check permissions or select another input in Settings.");
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
      } else if (e.key === "[") {
        setTrimIn(currentTime);
      } else if (e.key === "]") {
        setTrimOut(currentTime);
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
      
      const mime = ["video/webm", "video/webm;codecs=vp8", "video/mp4"].find((m) =>
        MediaRecorder.isTypeSupported(m)
      ) || "";

      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        const name = `${namingPrefix}_${new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
        const newRec: SavedRecording = {
          id: Date.now().toString(),
          name,
          url,
          timestamp: new Date(),
        };
        setRecordings((prev) => [newRec, ...prev]);
        setActiveClipA(url);
        setActiveClipName(name);
        setPrimaryMode("analysis");
        setAnnotationsA([]);
        setAnnotationsB([]);
        setTrimIn(null);
        setTrimOut(null);
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

  const handleImportVideo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    const cleanName = file.name.replace(/\.[^/.]+$/, "");
    const newRec: SavedRecording = {
      id: Date.now().toString(),
      name: cleanName,
      url,
      timestamp: new Date(),
    };

    setRecordings((prev) => [newRec, ...prev]);
    setActiveClipA(url);
    setActiveClipName(cleanName);
    setPrimaryMode("analysis");
    setAnnotationsA([]);
    setAnnotationsB([]);
    
    if (videoARef.current) {
      videoARef.current.load();
    }
    setTimeout(syncCanvasDimensions, 100);
  };

  const handleDeleteRecording = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRecordings((prev) => prev.filter((r) => r.id !== id));
    if (activeClipA && recordings.find((r) => r.id === id)?.url === activeClipA) {
      setActiveClipA(null);
    }
    if (activeClipB && recordings.find((r) => r.id === id)?.url === activeClipB) {
      setActiveClipB(null);
      setDualMode(false);
    }
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
  }, [annotationsA, currentPointsA, mousePosA, activeTool]);

  useEffect(() => {
    if (dualMode) {
      renderCanvas(canvasBRef.current, annotationsB, currentPointsB, mousePosB);
    }
  }, [annotationsB, currentPointsB, mousePosB, activeTool, dualMode]);

  const executeActiveTrim = () => {
    const start = trimIn !== null ? trimIn : 0;
    const end = trimOut !== null ? trimOut : duration;
    alert(`Trim marks saved: ${start.toFixed(2)}s to ${end.toFixed(2)}s for ${activeClipName}`);
    setTrimIn(null);
    setTrimOut(null);
  };

  const sendEmailReport = () => {
    const angleList = [...annotationsA, ...annotationsB]
      .filter((a) => a.type === "angle" && a.angleValue !== undefined)
      .map((a, i) => `Angle ${i + 1}: ${a.angleValue}°`)
      .join("\n");

    const notes = [...annotationsA, ...annotationsB]
      .filter((a) => a.type === "text" && a.text)
      .map((a) => `Note: ${a.text}`)
      .join("\n");

    const subject = encodeURIComponent(`Peak Podiatry Gait Report - ${activeClipName}`);
    const bodyContent = `PEAK PODIATRY CLINICAL GAIT REPORT\n` +
      `---------------------------------\n` +
      `Trial: ${activeClipName}\n` +
      `Date: ${new Date().toLocaleDateString("en-GB")}\n` +
      `Duration: ${duration.toFixed(2)}s\n\n` +
      `MEASUREMENTS:\n` +
      `${angleList || "None recorded."}\n\n` +
      `OBSERVATIONS:\n` +
      `${notes || "None."}\n\n` +
      `Exported via Peak Podiatry +One Gait Lab.`;

    const mailtoUri = `mailto:?subject=${subject}&body=${encodeURIComponent(bodyContent)}`;
    const anchor = document.createElement("a");
    anchor.href = mailtoUri;
    anchor.click();
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

      {/* Top Header */}
      <header className="relative flex items-center justify-between px-6 py-2.5 bg-[#181818] border-b border-[#282828] z-30">
        <div className="flex items-center gap-4 z-10">
          <img 
            src="/peak-logo.png" 
            onError={(e) => { (e.target as HTMLImageElement).src = "/logo.svg"; }}
            alt="Peak Podiatry" 
            className="h-8 w-auto object-contain"
          />
          <div className="h-5 w-[1px] bg-gray-700" />
          <span className="text-xs font-mono font-bold tracking-widest text-[#009456]">+ONE</span>
        </div>

        {/* Centred Mode Switchers */}
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

        <div className="flex items-center gap-3 z-10">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#202020] hover:bg-[#282828] text-xs text-gray-200 border border-[#333333] cursor-pointer"
            title="Import an existing video"
          >
            <UploadCloud className="w-3.5 h-3.5 text-[#009456]" /> Import Video
          </button>

          <button
            onClick={() => setDrawerOpen(!drawerOpen)}
            className="flex items-center gap-2 px-3 py-1.5 rounded bg-[#202020] hover:bg-[#282828] text-xs text-gray-200 border border-[#333333] cursor-pointer"
          >
            <Folder className="w-3.5 h-3.5 text-[#009456]" /> Recordings ({recordings.length})
          </button>
        </div>
      </header>

      {/* Main View Area */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* Recordings Drawer */}
        <div
          className={`absolute left-0 top-0 bottom-0 w-84 bg-[#161616] border-r border-[#282828] z-40 transition-transform duration-300 flex flex-col ${
            drawerOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between p-4 border-b border-[#282828]">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400">Recorded Sessions</h2>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => fileInputRef.current?.click()} 
                title="Browse & Import from Disk"
                className="text-gray-400 hover:text-[#009456] p-1 cursor-pointer"
              >
                <FolderOpen className="w-4 h-4" />
              </button>
              <button onClick={() => setDrawerOpen(false)} className="text-gray-400 hover:text-white text-xs cursor-pointer">✕</button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {recordings.length === 0 ? (
              <p className="text-xs text-gray-600 text-center py-8">No recordings captured or imported yet.</p>
            ) : (
              recordings.map((rec) => (
                <div key={rec.id} className="p-3 bg-[#202020] rounded border border-gray-800 flex flex-col gap-2">
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
                          onClick={() => {
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
                      <button onClick={() => { setEditingId(rec.id); setRenameText(rec.name); }} className="text-gray-500 hover:text-white p-1 cursor-pointer">
                        <Edit2 className="w-3 h-3" />
                      </button>
                      <button onClick={(e) => handleDeleteRecording(rec.id, e)} className="text-gray-500 hover:text-red-400 p-1 cursor-pointer">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[10px] text-gray-500">{rec.timestamp.toLocaleTimeString()}</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setActiveClipA(rec.url);
                          setActiveClipName(rec.name);
                          setPrimaryMode("analysis");
                          setDrawerOpen(false);
                          if (videoARef.current) videoARef.current.load();
                          setTimeout(syncCanvasDimensions, 50);
                        }}
                        className="text-[11px] text-[#009456] hover:underline cursor-pointer font-semibold"
                      >
                        Load Primary
                      </button>
                      <button
                        onClick={() => {
                          setActiveClipB(rec.url);
                          setDualMode(true);
                          setPrimaryMode("analysis");
                          setDrawerOpen(false);
                          if (videoBRef.current) videoBRef.current.load();
                          setTimeout(syncCanvasDimensions, 50);
                        }}
                        className="text-[11px] text-gray-400 hover:text-white cursor-pointer"
                      >
                        + Split View
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
                  <p className="text-xs text-gray-400">{cameraErrorMsg || "Camera stream initializing..."}</p>
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
              <div ref={containerARef} className="relative flex-1 h-full flex items-center justify-center bg-black">
                <video
                  ref={videoARef}
                  src={activeClipA || ""}
                  playsInline
                  muted
                  preload="auto"
                  onTimeUpdate={() => {
                    if (videoARef.current) setCurrentTime(videoARef.current.currentTime);
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
                  TRIAL A (PRIMARY)
                </div>
              </div>

              {/* Screen B (Dual View) */}
              {dualMode && (
                <div ref={containerBRef} className="relative flex-1 h-full border-l border-[#282828] flex items-center justify-center bg-black">
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
                    TRIAL B (COMPARISON)
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

      {/* Settings Modal (Fixed CSS overrides) */}
      {settingsOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center z-50">
          <div className="bg-[#1c1c1c] border border-[#2e2e2e] rounded-lg w-96 p-5 flex flex-col gap-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#282828] pb-3">
              <h3 className="text-sm font-bold tracking-wide text-gray-200 uppercase flex items-center gap-2">
                <Settings className="w-4 h-4 text-[#009456]" /> Device & Lab Settings
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
                <div className="relative">
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
                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                  Default File Prefix
                </label>
                <input
                  type="text"
                  value={namingPrefix}
                  onChange={(e) => setNamingPrefix(e.target.value)}
                  className="w-full bg-[#121212] border border-[#333333] rounded px-3 py-1.5 text-xs text-white outline-none"
                  placeholder="Trial"
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
                Save & Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer Controls */}
      <footer className="px-6 py-3 bg-[#181818] border-t border-[#282828] z-30">
        {primaryMode === "capture" ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSettingsOpen(true)}
                className="p-2 rounded bg-[#222222] hover:bg-[#2c2c2c] text-gray-300 hover:text-white border border-[#333333] cursor-pointer"
                title="Lab & Camera Settings"
              >
                <Settings className="w-4 h-4 text-[#009456]" />
              </button>
              <span className="text-xs text-gray-500 font-mono">
                Controls: <kbd className="px-2 py-0.5 bg-[#252525] border border-gray-700 rounded text-gray-300">SPACE</kbd> Record/Stop
              </span>
            </div>

            <button
              onClick={toggleRecording}
              className={`flex items-center gap-2 px-8 py-2.5 rounded font-bold text-xs uppercase tracking-wider transition cursor-pointer ${
                isRecording ? "bg-red-600 hover:bg-red-700 text-white" : "bg-[#009456] hover:bg-[#007a46] text-white"
              }`}
            >
              {isRecording ? <Square className="w-4 h-4 fill-white" /> : <Camera className="w-4 h-4" />}
              {isRecording ? "Stop & Analyse" : "Start Capture"}
            </button>
            <div className="w-48" />
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="relative flex items-center gap-4 w-full">
              <span className="text-xs font-mono text-gray-400 w-14">{currentTime.toFixed(2)}s</span>
              
              <div className="relative flex-1 flex items-center">
                <input
                  type="range"
                  min={0}
                  max={duration || 1}
                  step={0.001}
                  value={currentTime}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (videoARef.current) {
                      videoARef.current.currentTime = val;
                      setCurrentTime(val);
                    }
                    if (dualMode && videoBRef.current) {
                      videoBRef.current.currentTime = Math.max(0, val + syncOffset);
                    }
                  }}
                  className="w-full accent-[#009456] h-1.5 bg-[#252525] rounded cursor-pointer"
                />

                {trimIn !== null && duration > 0 && (
                  <div
                    style={{ left: `${(trimIn / duration) * 100}%` }}
                    className="absolute top-1/2 -translate-y-1/2 w-1.5 h-4 bg-yellow-400 rounded-sm pointer-events-none"
                    title={`Mark-In: ${trimIn.toFixed(2)}s`}
                  />
                )}
                {trimOut !== null && duration > 0 && (
                  <div
                    style={{ left: `${(trimOut / duration) * 100}%` }}
                    className="absolute top-1/2 -translate-y-1/2 w-1.5 h-4 bg-red-400 rounded-sm pointer-events-none"
                    title={`Mark-Out: ${trimOut.toFixed(2)}s`}
                  />
                )}
              </div>

              <span className="text-xs font-mono text-gray-400 w-14 text-right">{duration.toFixed(2)}s</span>
            </div>

            <div className="flex items-center justify-between pt-1">
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
                    title="Protractor Angle"
                  >
                    <Compass className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setActiveTool("line")}
                    className={`p-1.5 rounded cursor-pointer ${activeTool === "line" ? "bg-[#009456] text-white" : "text-gray-400 hover:text-white"}`}
                    title="Straight Line (Drag)"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setActiveTool("arrow")}
                    className={`p-1.5 rounded cursor-pointer ${activeTool === "arrow" ? "bg-[#009456] text-white" : "text-gray-400 hover:text-white"}`}
                    title="Directed Arrow (Drag)"
                  >
                    <MoveUpRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setActiveTool("freehand")}
                    className={`p-1.5 rounded cursor-pointer ${activeTool === "freehand" ? "bg-[#009456] text-white" : "text-gray-400 hover:text-white"}`}
                    title="Freehand Pen (Drag)"
                  >
                    <PenTool className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setActiveTool("text")}
                    className={`p-1.5 rounded cursor-pointer ${activeTool === "text" ? "bg-[#009456] text-white" : "text-gray-400 hover:text-white"}`}
                    title="Text Note"
                  >
                    <Type className="w-4 h-4" />
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
                    title="Clear Annotations"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Active Trial Name */}
              <div className="flex items-center gap-2 bg-[#202020] px-3 py-1 rounded border border-[#2e2e2e]">
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

              {/* Speed Controls */}
              <div className="flex items-center gap-1 bg-[#202020] p-1 rounded border border-[#2e2e2e]">
                {[0.25, 0.5, 1.0].map((rate) => (
                  <button
                    key={rate}
                    onClick={() => handleSpeedChange(rate)}
                    className={`px-2 py-0.5 rounded text-[11px] font-mono cursor-pointer ${
                      playbackRate === rate ? "bg-[#009456] text-white font-bold" : "text-gray-400 hover:text-white"
                    }`}
                  >
                    {rate}x
                  </button>
                ))}
              </div>

              {/* Trimming & Actions */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setTrimIn(currentTime)}
                  className={`px-2 py-1 rounded text-[10px] font-mono border cursor-pointer ${
                    trimIn !== null ? "bg-yellow-400/20 text-yellow-300 border-yellow-400" : "bg-[#252525] text-gray-400 border-gray-700"
                  }`}
                  title="Mark In Point ('[' key)"
                >
                  Set [In]
                </button>
                <button
                  onClick={() => setTrimOut(currentTime)}
                  className={`px-2 py-1 rounded text-[10px] font-mono border cursor-pointer ${
                    trimOut !== null ? "bg-red-400/20 text-red-300 border-red-400" : "bg-[#252525] text-gray-400 border-gray-700"
                  }`}
                  title="Mark Out Point (']' key)"
                >
                  Set [Out]
                </button>

                {(trimIn !== null || trimOut !== null) && (
                  <button
                    onClick={executeActiveTrim}
                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#009456] text-white text-xs font-bold hover:bg-[#007a46] cursor-pointer"
                  >
                    <Scissors className="w-3 h-3" /> Cut
                  </button>
                )}

                <button
                  onClick={sendEmailReport}
                  className="flex items-center gap-1 px-3 py-1.5 rounded bg-[#252525] hover:bg-[#303030] text-xs text-gray-300 border border-gray-700 cursor-pointer"
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

                <button
                  onClick={togglePlayback}
                  className="px-4 py-1.5 rounded bg-[#009456] text-white font-bold text-xs flex items-center gap-1 cursor-pointer hover:bg-[#007a46]"
                >
                  {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  {isPlaying ? "Pause" : "Play"}
                </button>

                {dualMode && (
                  <div className="flex items-center gap-2 bg-[#202020] px-3 py-1 rounded border border-[#2e2e2e]">
                    <span 
                      onDoubleClick={() => setSyncOffset(0)}
                      title="Double-click to reset"
                      className="text-[10px] uppercase font-bold text-gray-400 cursor-pointer hover:text-white"
                    >
                      Gait Sync (0s):
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
    </div>
  );
}
