# PowerShell script to allow port 3000 in Windows Firewall
# Run this as Administrator

Write-Host "Configuring Windows Firewall to allow port 3000..." -ForegroundColor Yellow

# Remove existing rule if it exists
netsh advfirewall firewall delete rule name="Node.js Server Port 3000" 2>$null

# Add new inbound rule for port 3000
netsh advfirewall firewall add rule name="Node.js Server Port 3000" dir=in action=allow protocol=TCP localport=3000

Write-Host "✅ Firewall rule added successfully!" -ForegroundColor Green
Write-Host "Port 3000 is now open for incoming connections." -ForegroundColor Green
Write-Host ""
Write-Host "If you still have issues:" -ForegroundColor Yellow
Write-Host "1. Make sure both devices are on the same Wi-Fi network" -ForegroundColor Yellow
Write-Host "2. Verify your server IP address with: ipconfig" -ForegroundColor Yellow
Write-Host "3. Try accessing: http://YOUR_IP:3000/api/v1/health" -ForegroundColor Yellow

