# Kubernetes Deployment

## Prerequisites

Start a Kubernetes cluster first:

### Option 1: Docker Desktop
1. Enable Kubernetes in Docker Desktop settings
2. Wait for cluster to start

### Option 2: Minikube
```powershell
minikube start
```

### Option 3: Kind
```powershell
kind create cluster
```

## Deploy
Once cluster is running:
```powershell
.\deploy.ps1
```

## Verify
```powershell
kubectl get pods --namespace=video-host
kubectl get services --namespace=video-host
```