@echo off
cd /d "%~dp0"
echo Abriendo el juego en http://localhost:5173 ...
echo (deja esta ventana abierta mientras juegas)
start "" http://localhost:5173
python -m http.server 5173
