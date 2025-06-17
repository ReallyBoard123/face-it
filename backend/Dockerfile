# Use an NVIDIA CUDA base image that includes the necessary drivers
FROM nvidia/cuda:11.7.1-base-ubuntu22.04

# Avoid prompts during apt-get installations
ENV DEBIAN_FRONTEND=noninteractive

# Install Python 3.10 and other necessary tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.10 \
    python3-pip \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Create a symlink so 'python' points to 'python3.10'
RUN ln -s /usr/bin/python3.10 /usr/bin/python

WORKDIR /app

# Copy and install Python dependencies. This will include the GPU-enabled torch.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# DO NOT pre-download models here. They will be downloaded on the first run in the GPU environment.

# Copy the application code
COPY . .

# Expose the port
EXPOSE 8000

# Run the application. When it starts on Cloud Run, get_detector() will be called,
# and it will download the models and use the available GPU.
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]