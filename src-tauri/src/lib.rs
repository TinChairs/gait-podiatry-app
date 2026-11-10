use std::fs;
use std::path::PathBuf;
use std::process::Command;

#[tauri::command]
fn save_file_to_disk(base64_data: String, target_dir: String, filename: String) -> Result<String, String> {
    use base64::Engine;
    let engine = base64::engine::general_purpose::STANDARD;
    
    let bytes = engine.decode(base64_data).map_err(|e| format!("Base64 decode failed: {}", e))?;
    
    let dir_path = PathBuf::from(&target_dir);
    if !dir_path.exists() {
        fs::create_dir_all(&dir_path).map_err(|e| format!("Failed to create directory {}: {}", target_dir, e))?;
    }
    
    let full_path = dir_path.join(&filename);
    fs::write(&full_path, bytes).map_err(|e| format!("Failed to write file {}: {}", full_path.display(), e))?;
    
    Ok(full_path.to_string_lossy().to_string())
}

#[tauri::command]
fn open_in_explorer(folder_path: String) -> Result<(), String> {
    let path = PathBuf::from(&folder_path);
    if !path.exists() {
        let _ = fs::create_dir_all(&path);
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(&folder_path)
            .spawn()
            .map_err(|e| format!("Explorer failed to open: {}", e))?;
    }
    #[cfg(not(target_os = "windows"))]
    {
        Command::new("xdg-open")
            .arg(&folder_path)
            .spawn()
            .map_err(|e| format!("File manager failed to open: {}", e))?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![save_file_to_disk, open_in_explorer])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
