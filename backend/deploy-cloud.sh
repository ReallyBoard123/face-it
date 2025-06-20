#!/bin/bash

# FaceIt Backend Cloud Deployment Script
# This script builds and deploys the backend to Google Cloud Run

set -e

echo "🚀 FaceIt Backend Cloud Deployment"
echo "=================================="

# Check if gcloud is available
if ! command -v gcloud &> /dev/null; then
    echo "❌ Error: gcloud CLI not found. Please install it first."
    exit 1
fi

# Configuration
PROJECT_ID="face-it-463112"
REGION="europe-west4"
REPOSITORY="faceit-backend-repo"
IMAGE_NAME="faceit-backend"
SERVICE_NAME="faceit-backend-gpu"

echo "📦 Building Docker image..."
docker build -t ${IMAGE_NAME}:gpu .

echo "🏷️ Tagging image for Google Cloud..."
docker tag ${IMAGE_NAME}:gpu us-central1-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${IMAGE_NAME}:gpu

echo "📤 Pushing to Google Container Registry..."
docker push us-central1-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${IMAGE_NAME}:gpu

echo "🚀 Deploying to Cloud Run..."
gcloud run deploy ${SERVICE_NAME} \
  --image=us-central1-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${IMAGE_NAME}:gpu \
  --region=${REGION} \
  --gpu=1 \
  --concurrency=10 \
  --max-instances=3 \
  --timeout=3600 \
  --memory=32Gi \
  --cpu=8 \
  --allow-unauthenticated \
  --port=8000 \
  --set-env-vars="DEPLOYMENT_MODE=cloud"

echo ""
echo "✅ Deployment completed!"
echo ""
echo "🌐 Your backend is now available at:"
gcloud run services describe ${SERVICE_NAME} --region=${REGION} --format="value(status.url)"
echo ""
echo "📊 Monitor your deployment:"
echo "   - Cloud Run Console: https://console.cloud.google.com/run/detail/${REGION}/${SERVICE_NAME}"
echo "   - Logs: gcloud logs tail --follow --service=${SERVICE_NAME}"
echo ""
echo "💡 To use this backend in your frontend, set:"
echo "   export NEXT_PUBLIC_API_URL=<your-cloud-run-url>"