// components/dialogs/eye-tracking-calibration-dialog.tsx
'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Eye, AlertCircle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

interface EyeTrackingCalibrationDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onCalibrationSuccess: (sessionId: string) => void;
}

export function EyeTrackingCalibrationDialog({
  isOpen,
  onOpenChange,
  onCalibrationSuccess,
}: EyeTrackingCalibrationDialogProps) {
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibrationStep, setCalibrationStep] = useState<'ready' | 'calibrating' | 'success' | 'error'>('ready');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const startCalibration = async () => {
    setIsCalibrating(true);
    setCalibrationStep('calibrating');
    setErrorMessage('');

    try {
      const response = await fetch('http://localhost:8000/eyetrax/calibration/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Calibration failed');
      }

      const data = await response.json();
      
      if (data.success) {
        setCalibrationStep('success');
        toast.success('Eye tracking calibration completed!', {
          description: `Session ID: ${data.session_id}`,
          duration: 5000,
        });
        onCalibrationSuccess(data.session_id);
        
        // Auto-close dialog after success
        setTimeout(() => {
          onOpenChange(false);
          resetDialog();
        }, 2000);
      } else {
        throw new Error(data.message || 'Calibration failed');
      }
    } catch (error) {
      console.error('Calibration error:', error);
      setCalibrationStep('error');
      setErrorMessage(error instanceof Error ? error.message : 'Unknown error occurred');
      
      toast.error('Eye tracking calibration failed', {
        description: error instanceof Error ? error.message : 'Unknown error occurred',
        duration: 5000,
      });
    } finally {
      setIsCalibrating(false);
    }
  };

  const resetDialog = () => {
    setCalibrationStep('ready');
    setErrorMessage('');
    setIsCalibrating(false);
  };

  const handleOpenChange = (open: boolean) => {
    if (!isCalibrating) {
      onOpenChange(open);
      if (!open) {
        resetDialog();
      }
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Eye Tracking Calibration
          </DialogTitle>
          <DialogDescription>
            {calibrationStep === 'ready' && 
              "This will start EyeTrax's built-in 9-point calibration process."
            }
            {calibrationStep === 'calibrating' && 
              "Follow the calibration window instructions. Look at each point when it appears."
            }
            {calibrationStep === 'success' && 
              "Calibration completed successfully! You can now use eye tracking."
            }
            {calibrationStep === 'error' && 
              "Calibration failed. Please try again or check your camera permissions."
            }
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {calibrationStep === 'ready' && (
            <Alert>
              <Eye className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-2">
                  <p>Before starting calibration:</p>
                  <ul className="text-sm space-y-1 ml-4 list-disc">
                    <li>Ensure your webcam is connected and working</li>
                    <li>Position yourself comfortably in front of the screen</li>
                    <li>EyeTrax will open its own calibration window</li>
                    <li>Follow the on-screen instructions</li>
                  </ul>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {calibrationStep === 'calibrating' && (
            <div className="flex flex-col items-center space-y-4 py-6">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <div className="text-center">
                <p className="font-medium">Calibration in progress...</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Look at each calibration point when it appears in the EyeTrax window.
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  Press ESC in the calibration window to cancel if needed.
                </p>
              </div>
            </div>
          )}

          {calibrationStep === 'success' && (
            <div className="flex flex-col items-center space-y-4 py-6">
              <CheckCircle2 className="h-12 w-12 text-green-500" />
              <div className="text-center">
                <p className="font-medium text-green-600">Calibration Successful!</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Eye tracking is now ready to use.
                </p>
              </div>
            </div>
          )}

          {calibrationStep === 'error' && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-2">
                  <p className="font-medium">Calibration Failed</p>
                  <p className="text-sm">{errorMessage}</p>
                  <p className="text-xs">
                    Make sure your camera is working and you have proper lighting.
                  </p>
                </div>
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          {calibrationStep === 'ready' && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={startCalibration} disabled={isCalibrating}>
                <Eye className="mr-2 h-4 w-4" />
                Start Calibration
              </Button>
            </>
          )}
          
          {calibrationStep === 'calibrating' && (
            <Button variant="outline" disabled>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Calibrating...
            </Button>
          )}
          
          {calibrationStep === 'error' && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={startCalibration}>
                Try Again
              </Button>
            </>
          )}
          
          {calibrationStep === 'success' && (
            <Button onClick={() => onOpenChange(false)}>
              Close
            </Button>
            )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}