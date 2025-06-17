# Use a single stage for simplicity and reliability
FROM python:3.10-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install them globally.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download the py-feat models. They will be stored in the image.
# We run this as the root user, so they go into /root/.local/share/py-feat
RUN python -c "from feat import Detector; Detector()"

# Copy the application code
COPY . .

# Expose the port the app runs on
EXPOSE 8000

# Run the application as the default root user.
# While not ideal for production security, this simplifies pathing for this demo.
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]