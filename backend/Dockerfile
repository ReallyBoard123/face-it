# Use a single stage for simplicity and reliability
FROM python:3.10-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install them to the user directory.
# This ensures packages AND downloaded models are in one place: /root/.local
COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# Pre-download the py-feat models. This will also place them in /root/.local
RUN python -c "from feat import Detector; Detector()"

# Add the user's local binary directory to the system's PATH
ENV PATH=/root/.local/bin:$PATH

# Copy the rest of your application code
COPY . .

# Expose the port the app runs on
EXPOSE 8000

# Command to run the application
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]