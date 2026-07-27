@echo off
echo Configuring Windows Firewall to allow port 3000...
echo This requires Administrator privileges.
echo.

REM Remove existing rule if it exists
netsh advfirewall firewall delete rule name="Node.js Server Port 3000" 2>nul

REM Add new inbound rule for port 3000
netsh advfirewall firewall add rule name="Node.js Server Port 3000" dir=in action=allow protocol=TCP localport=3000

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ✅ Firewall rule added successfully!
    echo Port 3000 is now open for incoming connections.
    echo.
    echo If you still have issues:
    echo 1. Make sure both devices are on the same Wi-Fi network
    echo 2. Verify your server IP address with: ipconfig
    echo 3. Try accessing: http://YOUR_IP:3000/api/v1/health
) else (
    echo.
    echo ❌ Failed to add firewall rule.
    echo Please run this script as Administrator.
)

pause

