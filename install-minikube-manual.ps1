# Manual minikube install (no admin required)
$minikubeUrl = "https://github.com/kubernetes/minikube/releases/latest/download/minikube-windows-amd64.exe"
$minikubePath = "$env:USERPROFILE\minikube.exe"

Write-Host "Downloading minikube..."
Invoke-WebRequest -Uri $minikubeUrl -OutFile $minikubePath

Write-Host "Adding to PATH for this session..."
$env:PATH += ";$env:USERPROFILE"

Write-Host "Minikube installed! Now run: .\deploy-minikube.ps1"