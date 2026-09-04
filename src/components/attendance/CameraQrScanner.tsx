import React, { useEffect, useRef, useState, useCallback } from "react";
import jsQR from "jsqr";
import { 
  Camera, 
  CameraOff, 
  Volume2, 
  VolumeX, 
  AlertTriangle, 
  RefreshCw, 
  SwitchCamera, 
  Upload, 
  Image as ImageIcon, 
  CheckCircle2, 
  Sparkles,
  Zap,
  ZapOff
} from "lucide-react";

interface CameraQrScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onScanError?: (error: string) => void;
  isMuted?: boolean;
  onToggleMute?: () => void;
}

export default function CameraQrScanner({
  onScanSuccess,
  onScanError,
  isMuted = false,
  onToggleMute,
}: CameraQrScannerProps) {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [errorType, setErrorType] = useState<"NOT_FOUND" | "PERMISSION_DENIED" | "BUSY" | "UNKNOWN" | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [isScanning, setIsScanning] = useState(false);
  const [isFileScanning, setIsFileScanning] = useState(false);
  const [fileScanSuccess, setFileScanSuccess] = useState<string | null>(null);
  const [availableDevices, setAvailableDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceIndex, setSelectedDeviceIndex] = useState<number>(0);
  const [retryTrigger, setRetryTrigger] = useState(0);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);
  const lastScannedTimeRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Stop current active media stream safely and release camera hardware
  const stopStream = useCallback(() => {
    if (animationFrameIdRef.current) {
      cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = null;
    }
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((track) => {
          try {
            track.stop();
          } catch {}
        });
      } catch {}
      streamRef.current = null;
    }
    if (videoRef.current) {
      try {
        if (videoRef.current.srcObject) {
          const stream = videoRef.current.srcObject as MediaStream;
          if (stream && typeof stream.getTracks === "function") {
            stream.getTracks().forEach((track) => {
              try {
                track.stop();
              } catch {}
            });
          }
        }
        videoRef.current.pause();
        videoRef.current.srcObject = null;
        videoRef.current.removeAttribute("src");
        videoRef.current.load();
      } catch {}
    }
    setIsScanning(false);
    setIsTorchOn(false);
  }, []);

  // Handle scanned decoded text
  const handleDecoded = useCallback((decodedText: string) => {
    const now = Date.now();
    // Debounce duplicate triggers within 2 seconds
    if (now - lastScannedTimeRef.current < 2000) return;
    lastScannedTimeRef.current = now;

    if (decodedText && decodedText.trim() && isMountedRef.current) {
      setFileScanSuccess("Badge QR identifié !");
      setTimeout(() => {
        if (isMountedRef.current) setFileScanSuccess(null);
      }, 1800);
      onScanSuccess(decodedText.trim());
    }
  }, [onScanSuccess]);

  // Frame scanner loop using BarcodeDetector API + jsQR fallback
  const scanVideoFrame = useCallback(() => {
    if (!isMountedRef.current) return;
    const video = videoRef.current;
    
    if (video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && !video.paused && !video.ended) {
      const videoWidth = video.videoWidth;
      const videoHeight = video.videoHeight;

      if (videoWidth > 0 && videoHeight > 0) {
        // Fast path: Hardware BarcodeDetector if supported
        if (typeof (window as any).BarcodeDetector !== "undefined") {
          try {
            const barcodeDetector = new (window as any).BarcodeDetector({ formats: ["qr_code"] });
            barcodeDetector.detect(video)
              .then((barcodes: any[]) => {
                if (barcodes && barcodes.length > 0 && barcodes[0]?.rawValue) {
                  handleDecoded(barcodes[0].rawValue);
                }
              })
              .catch(() => {
                // Fallback to jsQR canvas on detection error
              });
          } catch {}
        }

        // Standard path: In-memory Canvas + jsQR
        try {
          if (!canvasRef.current) {
            canvasRef.current = document.createElement("canvas");
          }
          const canvas = canvasRef.current;
          // Scale down for ultra fast optical scanning without CPU lag
          const targetWidth = Math.min(videoWidth, 640);
          const targetHeight = Math.floor((videoHeight / videoWidth) * targetWidth);

          if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
            canvas.width = targetWidth;
            canvas.height = targetHeight;
          }

          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (ctx) {
            ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
            const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
            const qrCode = jsQR(imageData.data, imageData.width, imageData.height, {
              inversionAttempts: "dontInvert",
            });

            if (qrCode && qrCode.data && qrCode.data.trim()) {
              handleDecoded(qrCode.data);
            } else {
              // Try inverted if not found
              const qrCodeInverted = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: "onlyInvert",
              });
              if (qrCodeInverted && qrCodeInverted.data && qrCodeInverted.data.trim()) {
                handleDecoded(qrCodeInverted.data);
              }
            }
          }
        } catch {}
      }
    }

    if (isMountedRef.current) {
      animationFrameIdRef.current = requestAnimationFrame(scanVideoFrame);
    }
  }, [handleDecoded]);

  // Image file QR decoder (drag & drop / photo file)
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsFileScanning(true);
    setFileScanSuccess(null);

    try {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          try {
            const canvas = document.createElement("canvas");
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext("2d", { willReadFrequently: true });
            if (!ctx) throw new Error("Impossible de créer le contexte de rendu");
            ctx.drawImage(img, 0, 0);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            
            let code = jsQR(imageData.data, imageData.width, imageData.height, {
              inversionAttempts: "attemptBoth"
            });

            if (code && code.data && code.data.trim()) {
              setFileScanSuccess("QR Code détecté avec succès !");
              handleDecoded(code.data.trim());
            } else {
              if (onScanError) {
                onScanError("Aucun QR code lisible trouvé sur cette image. Veuillez utiliser une photo plus nette.");
              }
            }
          } catch (err: any) {
            if (onScanError) {
              onScanError(err?.message || "Erreur de décodage de l'image.");
            }
          } finally {
            setIsFileScanning(false);
          }
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    } catch {
      setIsFileScanning(false);
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  // Toggle flashlight / torch if supported by camera track
  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return;
    try {
      const newTorch = !isTorchOn;
      await (track as any).applyConstraints({
        advanced: [{ torch: newTorch }]
      });
      setIsTorchOn(newTorch);
    } catch {}
  };

  // Explicitly prompt for camera permissions and initialize stream
  const requestCameraAccess = async () => {
    setHasPermission(null);
    setErrorType(null);
    setErrorMsg("");

    try {
      if (!navigator?.mediaDevices?.getUserMedia) {
        throw new Error("L'API de capture vidéo n'est pas supportée dans ce navigateur.");
      }

      // Explicit user-gesture trigger for browser permission prompt
      const testStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false
      });

      // Release test stream and trigger standard lifecycle
      testStream.getTracks().forEach((t) => t.stop());
      setRetryTrigger((prev) => prev + 1);
    } catch (err: any) {
      console.warn("[CameraQrScanner] Direct permission request error:", err);
      const errMsg = err?.message || String(err || "");
      const errName = err?.name || "";

      if (
        errName === "NotAllowedError" ||
        errName === "PermissionDeniedError" ||
        errMsg.includes("Permission denied") ||
        errMsg.includes("NotAllowedError")
      ) {
        setErrorType("PERMISSION_DENIED");
        setErrorMsg("Accès caméra refusé. Veuillez autoriser l'accès à la caméra dans les paramètres de votre navigateur.");
      } else if (
        errName === "NotFoundError" ||
        errName === "DevicesNotFoundError" ||
        errMsg.includes("NotFoundError")
      ) {
        setErrorType("NOT_FOUND");
        setErrorMsg("Aucun capteur caméra détecté sur cet appareil.");
      } else if (
        errName === "NotReadableError" ||
        errName === "TrackStartError" ||
        errMsg.includes("NotReadableError")
      ) {
        setErrorType("BUSY");
        setErrorMsg("La caméra est actuellement utilisée par une autre application.");
      } else {
        setErrorType("UNKNOWN");
        setErrorMsg(errMsg || "Impossible d'activer le flux vidéo de la caméra.");
      }
      setHasPermission(false);
    }
  };

  // Switch between available camera devices
  const switchCamera = () => {
    if (availableDevices.length > 1) {
      setSelectedDeviceIndex((prev) => (prev + 1) % availableDevices.length);
    }
  };

  // Main Camera Initialization Hook
  useEffect(() => {
    isMountedRef.current = true;

    const startCamera = async () => {
      stopStream();
      setHasPermission(null);
      setErrorType(null);
      setErrorMsg("");

      // 1. Validate MediaDevices API availability
      if (
        typeof window === "undefined" ||
        !navigator?.mediaDevices ||
        typeof navigator.mediaDevices.getUserMedia !== "function"
      ) {
        if (isMountedRef.current) {
          setHasPermission(false);
          setErrorType("NOT_FOUND");
          setErrorMsg("L'API de capture vidéo n'est pas supportée dans ce navigateur.");
        }
        return;
      }

      // 2. Discover available camera video inputs
      try {
        const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
        const videoDevices = devices.filter((d) => d.kind === "videoinput");
        if (isMountedRef.current && videoDevices.length > 0) {
          setAvailableDevices(videoDevices);
        }
      } catch {}

      // 3. Build resilient camera constraints
      let stream: MediaStream | null = null;
      let usedDevice = availableDevices[selectedDeviceIndex];

      const constraintAttempts: MediaStreamConstraints[] = [];

      if (usedDevice && usedDevice.deviceId) {
        constraintAttempts.push({
          video: {
            deviceId: { exact: usedDevice.deviceId },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        });
      }

      // Back camera (environment) preferred for mobile / tablet badge kiosks
      constraintAttempts.push({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });

      // Front camera (user) fallback
      constraintAttempts.push({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });

      // Generic video stream fallback
      constraintAttempts.push({
        video: true,
        audio: false
      });

      let lastError: any = null;

      for (const constraints of constraintAttempts) {
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
          if (stream) break;
        } catch (err: any) {
          lastError = err;
        }
      }

      if (!stream) {
        if (!isMountedRef.current) return;
        setHasPermission(false);
        const errMsg = lastError?.message || String(lastError || "");
        const errName = lastError?.name || "";

        if (
          errName === "NotAllowedError" ||
          errName === "PermissionDeniedError" ||
          errMsg.includes("Permission denied") ||
          errMsg.includes("NotAllowedError")
        ) {
          setErrorType("PERMISSION_DENIED");
          setErrorMsg("Accès caméra refusé. Veuillez autoriser l'accès dans les permissions de votre navigateur.");
        } else if (
          errName === "NotFoundError" ||
          errName === "DevicesNotFoundError" ||
          errMsg.includes("NotFoundError")
        ) {
          setErrorType("NOT_FOUND");
          setErrorMsg("Aucun capteur caméra détecté sur cet appareil.");
        } else if (
          errName === "NotReadableError" ||
          errName === "TrackStartError" ||
          errMsg.includes("NotReadableError")
        ) {
          setErrorType("BUSY");
          setErrorMsg("La caméra est actuellement utilisée par une autre application.");
        } else {
          setErrorType("UNKNOWN");
          setErrorMsg(errMsg || "Impossible d'activer le flux vidéo de la caméra.");
        }
        return;
      }

      if (!isMountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = stream;

      // Check if torch/flashlight is supported on the track
      try {
        const track = stream.getVideoTracks()[0];
        const capabilities: any = track?.getCapabilities ? track.getCapabilities() : {};
        if (capabilities?.torch) {
          setTorchAvailable(true);
        }
      } catch {}

      // Attach stream to video element
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch {}
      }

      setHasPermission(true);
      setIsScanning(true);
      setErrorMsg("");
      setErrorType(null);

      // Start the optical scanning loop
      animationFrameIdRef.current = requestAnimationFrame(scanVideoFrame);
    };

    startCamera();

    return () => {
      isMountedRef.current = false;
      stopStream();
    };
  }, [retryTrigger, selectedDeviceIndex, scanVideoFrame, stopStream]);

  return (
    <div className="w-full flex flex-col items-center gap-3">
      {/* Hidden file input for photo/badge scan fallback */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Main Viewport Stage */}
      <div className="relative w-full max-w-[340px] aspect-square bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col items-center justify-center">
        {/* Live Native Video Feed */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-cover transition-opacity duration-300 ${
            isScanning ? "opacity-100" : "opacity-0"
          }`}
        />

        {/* Laser Scanner animation effect line */}
        {isScanning && (
          <div className="absolute inset-x-0 h-0.5 bg-cyan-400 opacity-80 animate-[bounce_2s_infinite] shadow-[0_0_12px_#22d3ee] pointer-events-none" />
        )}

        {/* Framing & Crosshairs overlay */}
        {isScanning && (
          <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-6">
            <div className="flex justify-between">
              <div className="w-6 h-6 border-t-2 border-l-2 border-cyan-400 rounded-tl-sm shadow-[0_0_8px_#22d3ee]" />
              <div className="w-6 h-6 border-t-2 border-r-2 border-cyan-400 rounded-tr-sm shadow-[0_0_8px_#22d3ee]" />
            </div>
            <div className="flex justify-between">
              <div className="w-6 h-6 border-b-2 border-l-2 border-cyan-400 rounded-bl-sm shadow-[0_0_8px_#22d3ee]" />
              <div className="w-6 h-6 border-b-2 border-r-2 border-cyan-400 rounded-br-sm shadow-[0_0_8px_#22d3ee]" />
            </div>
          </div>
        )}

        {/* Guidance tip on top of video feed */}
        {isScanning && (
          <div className="absolute bottom-3 inset-x-3 text-center pointer-events-none">
            <span className="bg-slate-950/85 backdrop-blur-xs text-[10px] text-cyan-300 font-mono px-3 py-1 rounded-full border border-cyan-500/30 shadow-md">
              Présentez le badge QR face à la caméra
            </span>
          </div>
        )}

        {/* File / Photo scan success banner */}
        {fileScanSuccess && (
          <div className="absolute inset-0 bg-emerald-950/90 flex flex-col items-center justify-center p-4 text-center z-30 animate-in fade-in duration-200">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mb-2 animate-bounce" />
            <span className="text-xs font-bold text-emerald-200">{fileScanSuccess}</span>
          </div>
        )}

        {/* Permission / Error screen fallback states */}
        {hasPermission === false && (
          <div className="absolute inset-0 bg-slate-900/98 flex flex-col items-center justify-center p-5 text-center text-xs z-20">
            {errorType === "NOT_FOUND" ? (
              <CameraOff className="w-10 h-10 text-amber-400 mb-2" />
            ) : (
              <AlertTriangle className="w-10 h-10 text-rose-500 mb-2" />
            )}

            <h6 className="font-black uppercase tracking-wider text-slate-200 mb-1 text-[11px]">
              {errorType === "NOT_FOUND" ? "Aucune Caméra Détectée" : "Accès Caméra Requis"}
            </h6>

            <p className="text-slate-400 text-[11px] leading-relaxed max-w-[260px] mb-3">
              {errorMsg}
            </p>

            <div className="flex flex-col gap-2 w-full max-w-[250px]">
              <button
                id="btn-authorize-camera-scan"
                type="button"
                onClick={requestCameraAccess}
                className="w-full py-2.5 px-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black tracking-wide rounded-xl text-xs flex items-center justify-center gap-2 transition-all duration-150 shadow-lg shadow-cyan-500/20 active:scale-[0.98] cursor-pointer"
              >
                <RefreshCw className="w-4 h-4 text-slate-950 animate-spin-reverse" />
                <span>Autoriser & Activer Caméra</span>
              </button>

              <button
                id="btn-upload-badge-fallback"
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-2 px-3 bg-slate-800/90 hover:bg-slate-700 text-cyan-300 hover:text-cyan-200 font-semibold rounded-xl text-xs flex items-center justify-center gap-1.5 transition border border-slate-700/80 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Charger une photo du badge</span>
              </button>
            </div>
          </div>
        )}

        {/* Loading state while camera starts */}
        {hasPermission === null && (
          <div className="absolute inset-0 bg-slate-900 flex flex-col items-center justify-center p-6 text-center z-10">
            <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-xs text-slate-400 font-mono">Démarrage du flux vidéo direct...</p>
          </div>
        )}
      </div>

      {/* Action Controls Toolbar */}
      <div className="w-full max-w-[340px] flex flex-col gap-2">
        <div className="flex gap-2 items-center justify-between">
          {/* Switch Camera if multiple cameras available */}
          {availableDevices.length > 1 && (
            <button
              type="button"
              onClick={switchCamera}
              className="flex-1 py-1.5 px-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-300 text-[11px] font-medium flex items-center justify-center gap-1.5 transition cursor-pointer"
              title="Changer de caméra"
            >
              <SwitchCamera className="w-3.5 h-3.5 text-cyan-400" />
              <span>Caméra ({selectedDeviceIndex + 1}/{availableDevices.length})</span>
            </button>
          )}

          {/* Flashlight / Torch toggle if supported */}
          {torchAvailable && (
            <button
              type="button"
              onClick={toggleTorch}
              className={`p-1.5 px-2.5 rounded-lg border text-[11px] font-bold transition flex items-center gap-1.5 cursor-pointer ${
                isTorchOn
                  ? "bg-amber-500 text-slate-950 border-amber-400"
                  : "bg-slate-900 border-slate-800 text-slate-300 hover:text-amber-400"
              }`}
              title={isTorchOn ? "Éteindre le flash" : "Allumer le flash"}
            >
              {isTorchOn ? <Zap className="w-3.5 h-3.5 fill-current" /> : <ZapOff className="w-3.5 h-3.5" />}
              <span>Flash</span>
            </button>
          )}

          {/* Upload badge photo / image file option */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isFileScanning}
            className="flex-1 py-1.5 px-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-300 hover:text-cyan-300 text-[11px] font-medium flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50"
            title="Importer une image ou photo de badge"
          >
            {isFileScanning ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
            ) : (
              <ImageIcon className="w-3.5 h-3.5 text-cyan-400" />
            )}
            <span>{isFileScanning ? "Lecture..." : "Photo / Fichier"}</span>
          </button>

          {/* Audio Beep Toggle */}
          {onToggleMute && (
            <button
              type="button"
              onClick={onToggleMute}
              className={`p-1.5 px-2.5 rounded-lg border text-[11px] font-bold transition flex items-center gap-1.5 cursor-pointer ${
                isMuted
                  ? "bg-rose-950/30 border-rose-900/50 text-rose-400 hover:bg-rose-900/40"
                  : "bg-cyan-950/30 border-cyan-900/50 text-cyan-400 hover:bg-cyan-900/40"
              }`}
              title={isMuted ? "Activer le signal sonore" : "Désactiver le signal sonore"}
            >
              {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              <span>{isMuted ? "OFF" : "BIP"}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
