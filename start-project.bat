@echo off
title TechCampus Hub

echo =====================================
echo Starting TechCampus Hub
echo =====================================

:: Kill old Java process on port 8080
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8080" ^| findstr LISTENING') do (
    echo Stopping old backend PID %%a
    taskkill /PID %%a /F >nul 2>&1
)

timeout /t 2 >nul

echo Starting Backend...
start "Backend" cmd /k "cd /d ""%~dp0TechCampusHub-Backend"" && .\mvnw.cmd spring-boot:run"

timeout /t 12 >nul

echo Starting Frontend...
start "Frontend" cmd /k "cd /d ""%~dp0TechCampusHub-Frontend"" && npx live-server --port=5500"

timeout /t 5 >nul

start http://127.0.0.1:5500

exit