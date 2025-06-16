// types/webgazer.d.ts
declare module 'webgazer' {
    interface WebGazer {
      setRegression(regression: string): WebGazer;
      setTracker(tracker: string): WebGazer;
      setGazeListener(listener: (data: {x: number, y: number} | null, timestamp: number) => void): WebGazer;
      begin(): Promise<void>;
      end(): WebGazer;
      isReady(): boolean;
      showPredictionPoints(show: boolean): WebGazer;
      showFaceOverlay(show: boolean): WebGazer;
      showFaceFeedbackBox(show: boolean): WebGazer;
      showVideo(show: boolean): WebGazer;
      saveDataAcrossSessions(save: boolean): WebGazer;
      applyKalmanFilter(apply: boolean): WebGazer;
      clearData(): WebGazer;
      pause(): WebGazer;
      resume(): WebGazer;
      getCurrentPrediction(): {x: number, y: number} | null;
      clearGazeListener(): WebGazer;
      params: {
        showVideo: boolean;
        showPoints: boolean;
        showFaceOverlay: boolean;
        showFaceFeedbackBox: boolean;
      };
    }
  
    const webgazer: WebGazer;
    export default webgazer;
  }