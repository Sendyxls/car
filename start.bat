@echo off
chcp 65001 > nul
echo.
echo  ██████╗ ██████╗ ████████╗ ██████╗ ███╗   ███╗██╗██████╗
echo  ██╔══██╗██╔══██╗╚══██╔══╝██╔═══██╗████╗ ████║██║██╔══██╗
echo  ██████╔╝██████╔╝   ██║   ██║   ██║██╔████╔██║██║██████╔╝
echo  ██╔═══╝ ██╔══██╗   ██║   ██║   ██║██║╚██╔╝██║██║██╔══██╗
echo  ██║     ██║  ██║   ██║   ╚██████╔╝██║ ╚═╝ ██║██║██║  ██║
echo  ╚═╝     ╚═╝  ╚═╝   ╚═╝    ╚═════╝ ╚═╝     ╚═╝╚═╝╚═╝  ╚═╝
echo.
echo  Автомобили с пробегом — Запуск сервера
echo ============================================
echo.

python --version 2>nul
if errorlevel 1 (
    echo ОШИБКА: Python не найден!
    echo.
    echo Установите Python с https://www.python.org/downloads/
    echo При установке отметьте "Add Python to PATH"
    echo.
    pause
    exit /b 1
)

echo Установка зависимостей...
pip install -r requirements.txt -q
echo.
echo Запуск сервера...
echo.
echo  ► Откройте в браузере: http://localhost:5000
echo.
echo  (Для остановки нажмите Ctrl+C)
echo.
python app.py
pause
