from typing import Dict, Any
from backend.database import get_setting, set_setting, get_all_settings
from backend.gemini_service import GeminiService

class ConfigService:
    @staticmethod
    def get_settings() -> Dict[str, Any]:
        settings = get_all_settings()
        # Ocultar parcialmente la API Key para presentación segura si existe
        raw_key = settings.get("gemini_api_key", "")
        masked_key = (raw_key[:6] + "..." + raw_key[-4:]) if len(raw_key) > 10 else raw_key
        
        gemini_enabled_raw = settings.get("gemini_enabled", "true").strip().lower()
        gemini_enabled = gemini_enabled_raw in ("true", "1", "yes")
        has_gemini_key = bool(raw_key)
        is_ai_active = gemini_enabled and has_gemini_key

        def_cal_raw = settings.get("default_calendar_id", "1")
        try:
            default_calendar_id = int(def_cal_raw) if def_cal_raw else 1
        except (ValueError, TypeError):
            default_calendar_id = 1

        return {
            "gemini_api_key": raw_key,
            "gemini_api_key_masked": masked_key,
            "has_gemini_key": has_gemini_key,
            "gemini_enabled": gemini_enabled,
            "is_ai_active": is_ai_active,
            "gemini_model": settings.get("gemini_model", "gemini-2.5-flash"),
            "theme": settings.get("theme", "dark"),
            "ai_prompt_tone": settings.get("ai_prompt_tone", "formal"),
            "default_calendar_id": default_calendar_id
        }

    @staticmethod
    def update_settings(data: Dict[str, Any]) -> Dict[str, Any]:
        for k, v in data.items():
            set_setting(k, str(v).strip())
        return ConfigService.get_settings()

    @staticmethod
    def test_gemini(api_key: str) -> Dict[str, Any]:
        return GeminiService.test_api_key(api_key)

    @staticmethod
    def get_desktop_settings() -> Dict[str, Any]:
        import os
        install_dir = os.path.expanduser("~/.local/share/merkemail")
        launcher = os.path.join(install_dir, "desktop", "launcher.sh")
        autostart_file = os.path.expanduser("~/.config/autostart/merkemail.desktop")
        
        system_tray_raw = get_setting("desktop_system_tray", "true").strip().lower()
        system_tray = system_tray_raw in ("true", "1", "yes")
        autostart = os.path.exists(autostart_file)

        return {
            "installed": os.path.exists(launcher),
            "install_path": install_dir,
            "port": 6524,
            "system_tray": system_tray,
            "autostart": autostart
        }

    @staticmethod
    def update_desktop_settings(data: Dict[str, Any]) -> Dict[str, Any]:
        import os
        system_tray = bool(data.get("system_tray", True))
        autostart = bool(data.get("autostart", False))

        set_setting("desktop_system_tray", "true" if system_tray else "false")
        set_setting("desktop_autostart", "true" if autostart else "false")

        autostart_dir = os.path.expanduser("~/.config/autostart")
        autostart_file = os.path.join(autostart_dir, "merkemail.desktop")
        launcher = os.path.expanduser("~/.local/share/merkemail/desktop/launcher.sh")

        if autostart:
            os.makedirs(autostart_dir, exist_ok=True)
            content = f"""[Desktop Entry]
Type=Application
Name=MerkeMail
Comment=Inicio automático de MerkeMail
Exec={launcher} --autostart
Icon=merkemail
Terminal=false
Categories=Network;Email;Office;
X-GNOME-Autostart-enabled=true
StartupNotify=false
"""
            with open(autostart_file, "w", encoding="utf-8") as f:
                f.write(content)
        else:
            if os.path.exists(autostart_file):
                try:
                    os.remove(autostart_file)
                except Exception as e:
                    print(f"Aviso eliminando autostart: {e}")

        # Sincronizar ajustes con la base de datos instalada si existe
        installed_db = os.path.expanduser("~/.local/share/merkemail/data/merkemail.db")
        if os.path.exists(installed_db):
            try:
                import sqlite3
                conn = sqlite3.connect(installed_db)
                conn.execute('''
                    INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
                ''', ("desktop_system_tray", "true" if system_tray else "false"))
                conn.execute('''
                    INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
                ''', ("desktop_autostart", "true" if autostart else "false"))
                conn.commit()
                conn.close()
            except Exception as e:
                print(f"Aviso sincronizando ajustes con BD instalada: {e}")

        return ConfigService.get_desktop_settings()
