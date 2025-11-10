# Restart minikube to fix network issues
minikube delete
minikube start --driver=docker

# Start mount jobs
Write-Host "Starting directory mounts..."
Start-Job -Name "DataMount" -ScriptBlock {
    minikube mount "$using:PWD\data:/host/data"
}
Start-Job -Name "VideosMount" -ScriptBlock {
    minikube mount "D:\videos:/host/videos"
}

# Wait for mounts to be ready
Write-Host "Waiting for mounts to initialize..."
Start-Sleep 15

# Build and load image into minikube
docker build -t video-host:latest .
minikube image load video-host:latest

# Generate secrets
$JWT_SECRET = (New-Guid).ToString()
$ENCRYPTION_KEY = (New-Guid).ToString()

# Create namespace
kubectl create namespace video-host --dry-run=client -o yaml | kubectl apply -f -

# Create secrets
kubectl create secret generic video-host-secrets --from-literal=jwt-secret=$JWT_SECRET --from-literal=encryption-key=$ENCRYPTION_KEY --namespace=video-host

# Create ConfigMap for user data
kubectl create configmap user-data --from-file=data/users.json --namespace=video-host --dry-run=client -o yaml | kubectl apply -f -

# Apply manifests (excluding PVCs)
kubectl apply -f k8s/deployment.yaml --namespace=video-host
kubectl apply -f k8s/service.yaml --namespace=video-host

# Wait for deployment
kubectl rollout status deployment/video-host --namespace=video-host

Write-Host "Deployment complete! Starting port forwarding..."
Write-Host "Port forwarding to localhost:3000 - DO NOT CLOSE THIS WINDOW"
kubectl port-forward service/video-host-service 3000:80 --namespace=video-host