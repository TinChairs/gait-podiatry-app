use std::fs;
use std::path::PathBuf;

#[tauri::command]
fn save_file_to_disk(base64_data: String, target_dir: String, filename: String) -> Result<String, String> {
    use base64::Engine;
    let engine = base64::engine::general_purpose::STANDARD;
    
    let bytes = engine.decode(base64_data).map_err(|e| e.to_string())?;
    
    let path = PathBuf::from(&target_dir);
    if !path.exists() {
        fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    }
    
    let full_path = path.join(&filename);
    fs::write(&full_path, bytes).map_err(|e| e.to_string())?;
    
    Ok(full_path.to_string_lossy().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![save_file_to_disk])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
