"""启动入口"""
import os
import sys

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PROJECT_ROOT)

if sys.platform == "win32":
    # 使用项目内的浏览器安装，避免 Windows 用户级缓存的程序集加载错误。
    os.environ.setdefault(
        "PLAYWRIGHT_BROWSERS_PATH",
        os.path.join(PROJECT_ROOT, ".boss_profile", "browsers"),
    )

import uvicorn

if __name__ == "__main__":
    # reload=False 因为 Windows + reload 会触发 uvicorn 用 SelectorEventLoop，
    # 而 Python 3.13 的 SelectorEventLoop 不支持 create_subprocess_exec，
    # 导致 Playwright 无法启动 Firefox 浏览器
    uvicorn.run("boss_app.main:app", host="127.0.0.1", port=8010, reload=False)
