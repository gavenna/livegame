use serde::Serialize;
use std::io::{BufRead, Read, Seek, SeekFrom};
use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::State;

struct ProcState {
    game: Mutex<Option<Child>>,
    douyin: Mutex<Option<Child>>,
}

#[derive(Serialize, Clone)]
struct Status {
    game: bool,
    douyin: bool,
    game_pid: Option<u32>,
    douyin_pid: Option<u32>,
}

#[tauri::command]
fn get_status(state: State<ProcState>) -> Status {
    let g = state.game.lock().unwrap();
    let d = state.douyin.lock().unwrap();
    Status {
        game: g.is_some(),
        douyin: d.is_some(),
        game_pid: g.as_ref().map(|c| c.id()),
        douyin_pid: d.as_ref().map(|c| c.id()),
    }
}

#[tauri::command]
fn start_game(state: State<ProcState>) -> Result<String, String> {
    let exe = std::env::current_dir()
        .map_err(|e| e.to_string())?
        .join("war-danmaku.exe");

    if !exe.exists() {
        return Err(format!("找不到: {}", exe.display()));
    }

    let mut guard = state.game.lock().unwrap();
    if guard.is_some() {
        return Ok("已在运行中".into());
    }

    let child = Command::new(&exe)
        .current_dir(std::env::current_dir().map_err(|e| e.to_string())?)
        .spawn()
        .map_err(|e| format!("启动失败: {}", e))?;

    *guard = Some(child);
    Ok("ok".into())
}

#[tauri::command]
fn start_douyin(state: State<ProcState>) -> Result<String, String> {
    let base = std::env::current_dir().map_err(|e| e.to_string())?;
    let exe = base.join("tools").join("douyinLive.exe");

    if !exe.exists() {
        return Err(format!("找不到: {}", exe.display()));
    }

    let mut guard = state.douyin.lock().unwrap();
    if guard.is_some() {
        return Ok("已在运行中".into());
    }

    let secrets_path = base.join("server").join("secrets.json");
    if let Ok(raw) = std::fs::read_to_string(&secrets_path) {
        if let Ok(cfg) = serde_json::from_str::<serde_json::Value>(&raw) {
            if let Some(ck) = cfg["douyin"]["cookie"].as_str() {
                let yaml = format!(
                    "port: \"1088\"\nlog:\n  level: \"info\"\ncookie:\n  douyin: \"{}\"\n",
                    ck
                );
                let yaml_dir = base.join("tools");
                std::fs::create_dir_all(&yaml_dir).ok();
                std::fs::write(yaml_dir.join("douyinLive.yaml"), yaml).ok();
            }
        }
    }

    let child = Command::new(&exe)
        .arg("--config")
        .arg(base.join("tools").join("douyinLive.yaml"))
        .current_dir(&base)
        .spawn()
        .map_err(|e| format!("启动失败: {}", e))?;

    *guard = Some(child);
    Ok("ok".into())
}

#[tauri::command]
fn stop_douyin(state: State<ProcState>) -> Result<String, String> {
    if let Some(mut child) = state.douyin.lock().unwrap().take() {
        child.kill().ok();
    }
    let _ = Command::new("taskkill")
        .args(["/F", "/IM", "douyinLive.exe"])
        .output();
    Ok("ok".into())
}

#[tauri::command]
fn stop_all(state: State<ProcState>) -> Result<String, String> {
    if let Some(mut child) = state.game.lock().unwrap().take() {
        child.kill().ok();
    }
    if let Some(mut child) = state.douyin.lock().unwrap().take() {
        child.kill().ok();
    }
    let _ = Command::new("taskkill")
        .args(["/F", "/IM", "war-danmaku.exe"])
        .output();
    let _ = Command::new("taskkill")
        .args(["/F", "/IM", "douyinLive.exe"])
        .output();
    Ok("ok".into())
}

#[derive(Serialize)]
struct ConfigResult {
    data: serde_json::Value,
    error: Option<String>,
}

#[tauri::command]
fn read_config() -> ConfigResult {
    let base = std::env::current_dir().unwrap_or_default();
    let fp = base.join("server").join("secrets.json");
    match std::fs::read_to_string(&fp) {
        Ok(raw) => match serde_json::from_str(&raw) {
            Ok(v) => ConfigResult {
                data: v,
                error: None,
            },
            Err(e) => ConfigResult {
                data: serde_json::json!({}),
                error: Some(e.to_string()),
            },
        },
        Err(e) => ConfigResult {
            data: serde_json::json!({}),
            error: Some(e.to_string()),
        },
    }
}

#[tauri::command]
fn save_config(data: serde_json::Value) -> Result<String, String> {
    let base = std::env::current_dir().map_err(|e| e.to_string())?;
    let fp = base.join("server").join("secrets.json");
    let raw = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
    std::fs::write(&fp, raw).map_err(|e| e.to_string())?;
    Ok("ok".into())
}

#[derive(Serialize)]
struct LogEntry {
    ts: String,
    level: String,
    msg: String,
}

#[derive(Serialize)]
struct LogsResult {
    entries: Vec<LogEntry>,
    offset: u64,
}

#[tauri::command]
fn get_logs(offset: u64) -> LogsResult {
    let base = std::env::current_dir().unwrap_or_default();
    let fp = base.join("server").join("logs").join("combined.log");

    let mut entries = Vec::new();
    let mut new_offset = offset;

    if let Ok(file) = std::fs::File::open(&fp) {
        let mut reader = std::io::BufReader::new(file);
        if offset > 0 {
            let _ = reader.seek(SeekFrom::Start(offset));
        }
        let mut bytes_read: u64 = 0;
        for line in reader.by_ref().lines() {
            if let Ok(line) = line {
                bytes_read += line.len() as u64 + 1; // +1 for newline
                // 解析格式: [YYYY-MM-DD HH:MM:SS] LEVEL: [module] message
                if line.len() > 22 && line.starts_with('[') {
                    let ts = if line.len() >= 20 {
                        line[1..20].to_string()
                    } else {
                        String::new()
                    };
                    let rest = &line[21..]; // skip "] "
                    if let Some(colon) = rest.find(": ") {
                        let level = rest[..colon].to_string();
                        let msg = rest[colon + 2..].to_string();
                        entries.push(LogEntry { ts, level, msg });
                    }
                }
            }
        }
        new_offset = offset + bytes_read;
    }

    LogsResult {
        entries,
        offset: new_offset,
    }
}

#[tauri::command]
fn open_game() {
    let _ = std::process::Command::new("cmd")
        .args(["/c", "start", "", "http://localhost:3000"])
        .spawn();
}

#[tauri::command]
fn open_logs() {
    let base = std::env::current_dir().unwrap_or_default();
    let _ = std::process::Command::new("explorer")
        .arg(base.join("server").join("logs"))
        .spawn();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(ProcState {
            game: Mutex::new(None),
            douyin: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            get_status,
            start_game,
            start_douyin,
            stop_douyin,
            stop_all,
            read_config,
            save_config,
            get_logs,
            open_game,
            open_logs,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
