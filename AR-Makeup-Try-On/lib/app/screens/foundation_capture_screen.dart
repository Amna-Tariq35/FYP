// In-app capture for foundation matching.
//
// The preview stream checks light, and about twice a second checks that
// exactly one face is large enough, inside the oval, and facing the camera.
// It stops before the shutter. Focus and exposure are locked when the plugin
// allows it; an unsupported call is ignored. Exposure is not raised to rescue
// a dark room, and it is not changed between the three frames. Flash stays off.
//
// If the stream cannot run, or it fights the shutter, capture falls back to
// the written hints. The still sampler still rejects a bad photo. Gallery
// picks never use this live gate.

import 'dart:io';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_mlkit_face_detection/google_mlkit_face_detection.dart';

import '../services/skin_sampler.dart';
import '../utils/app_colors.dart';

class FoundationCaptureResult {
  const FoundationCaptureResult({
    this.paths,
    this.error,
    this.hint,
    this.chooseGallery = false,
  });

  final List<String>? paths;
  final String? error;
  final String? hint;
  final bool chooseGallery;
}

class _LightLine {
  const _LightLine(this.text, this.ready);

  final String text;
  final bool ready;
}

class _FaceGate {
  const _FaceGate(this.line, this.ok);

  final String line;
  final bool ok;
}

class _PreparedFace {
  const _PreparedFace({
    required this.image,
    required this.frameWidth,
    required this.frameHeight,
  });

  final InputImage image;
  final double frameWidth;
  final double frameHeight;
}

class FoundationCaptureScreen extends StatefulWidget {
  const FoundationCaptureScreen({super.key});

  /// DeepAR and this screen share Android's one CameraX provider. Opening the
  /// plugin unbinds DeepAR's feed, and disposing it does not put that feed
  /// back. Try-on reads this once when it is on screen again and rebinds.
  static bool cameraPluginTookDevice = false;

  @override
  State<FoundationCaptureScreen> createState() => _FoundationCaptureScreenState();
}

class _FoundationCaptureScreenState extends State<FoundationCaptureScreen> {
  CameraController? _controller;
  CameraDescription? _camera;
  String? _error;
  String? _hint;
  String _status = 'Move your face into the oval.';
  bool _busy = false;
  int _taken = 0;

  /// Capture stays off until light and the face gate both pass.
  bool _ready = false;

  /// True when the preview stream could not be used. Written hints, shutter on.
  bool _gateFallback = false;

  bool _closing = false;
  bool _released = false;
  DateTime? _lastJudge;
  DateTime? _lastFaceAt;
  bool _faceBusy = false;
  int _faceFailures = 0;
  bool _faceOk = false;
  String _faceHint = 'Move your face into the oval.';
  _LightLine? _pendingLight;
  Size? _viewSize;
  FaceDetector? _faces;

  static const _good = 'Good light. Hold still.';
  static const _fallbackLine =
      'Face a window, keep your bare face inside the oval, and hold still.';

  @override
  void initState() {
    super.initState();
    _open();
  }

  @override
  void dispose() {
    _releaseCamera(updateTree: false);
    super.dispose();
  }

  /// Stops the preview stream and disposes the plugin controller. Awaited
  /// before the route pops so CameraX is free before DeepAR binds again.
  Future<void> _releaseCamera({bool updateTree = true}) async {
    if (_released) return;
    _released = true;
    final controller = _controller;
    _controller = null;
    if (updateTree && mounted) {
      setState(() {});
      // Drop CameraPreview before dispose, or the plugin throws.
      await WidgetsBinding.instance.endOfFrame;
    }
    if (controller == null) return;
    try {
      if (controller.value.isInitialized && controller.value.isStreamingImages) {
        await controller.stopImageStream();
      }
    } catch (e) {
      debugPrint('[FoundationCapture] stop stream: $e');
    }
    try {
      await controller.dispose();
    } catch (e) {
      debugPrint('[FoundationCapture] dispose: $e');
    }
    final faces = _faces;
    _faces = null;
    if (faces != null) {
      try {
        await faces.close();
      } catch (e) {
        debugPrint('[FoundationCapture] close face detector: $e');
      }
    }
  }

  Future<void> _open() async {
    CameraController? controller;
    try {
      final cameras = await availableCameras();
      if (!mounted) return;
      if (cameras.isEmpty) {
        _fail(
          "This phone doesn't have a camera the app can use.",
          'You can still choose a photo from your gallery.',
        );
        return;
      }
      final camera = cameras.firstWhere(
        (c) => c.lensDirection == CameraLensDirection.front,
        orElse: () => cameras.first,
      );
      _camera = camera;
      controller = CameraController(
        camera,
        ResolutionPreset.medium,
        enableAudio: false,
        imageFormatGroup: Platform.isIOS ? ImageFormatGroup.bgra8888 : ImageFormatGroup.yuv420,
      );
      // Set before initialize: a failed open can still unbind DeepAR.
      FoundationCaptureScreen.cameraPluginTookDevice = true;
      await controller.initialize();
      try {
        await controller.setFlashMode(FlashMode.off);
      } catch (_) {}
      if (!mounted) {
        await controller.dispose();
        return;
      }
      setState(() => _controller = controller);
      await _startGate(controller);
    } on CameraException catch (e) {
      if (_controller == null) {
        try {
          await controller?.dispose();
        } catch (_) {}
      }
      final denied = e.code.toLowerCase().contains('denied') ||
          (e.description ?? '').toLowerCase().contains('permission');
      _fail(
        denied
            ? 'Camera access is off, so a live photo is not available.'
            : "Couldn't open the camera.",
        'You can still choose a photo from your gallery.',
      );
    } catch (e) {
      if (_controller == null) {
        try {
          await controller?.dispose();
        } catch (_) {}
      }
      debugPrint('[FoundationCapture] $e');
      _fail(
        "Couldn't open the camera.",
        'You can still choose a photo from your gallery.',
      );
    }
  }

  Future<void> _startGate(CameraController controller) async {
    try {
      await controller.startImageStream(_onPreview);
    } catch (e) {
      debugPrint('[FoundationCapture] stream unavailable: $e');
      _useWrittenHints();
    }
  }

  void _onPreview(CameraImage image) {
    if (_busy || _gateFallback || _closing || !mounted) return;
    final now = DateTime.now();
    final last = _lastJudge;
    if (last == null || now.difference(last).inMilliseconds >= 200) {
      _lastJudge = now;
      try {
        final line = _judgeLight(image);
        if (line == null) {
          _useWrittenHints();
          return;
        }
        _pendingLight = line;
        _publishGate();
      } catch (e) {
        debugPrint('[FoundationCapture] light check failed: $e');
        _useWrittenHints();
        return;
      }
    }
    _maybeQueueFace(image, now);
  }

  /// Light lines win. The face line is shown only when the light is usable.
  void _publishGate() {
    if (_gateFallback || _busy || _released || !mounted) return;
    final light = _pendingLight;
    if (light == null) return;
    final String status;
    final bool ready;
    if (!light.ready) {
      status = light.text;
      ready = false;
    } else if (!_faceOk) {
      status = _faceHint;
      ready = false;
    } else {
      status = _good;
      ready = true;
    }
    if (status == _status && ready == _ready) return;
    setState(() {
      _status = status;
      _ready = ready;
    });
  }

  void _useWrittenHints() {
    if (_gateFallback || _released || !mounted) return;
    _gateFallback = true;
    final controller = _controller;
    if (controller != null && controller.value.isStreamingImages) {
      controller.stopImageStream().catchError((Object e) {
        debugPrint('[FoundationCapture] stop after fallback: $e');
      });
    }
    setState(() {
      _status = _fallbackLine;
      _ready = true;
    });
  }

  /// Cheek halves, in preview brightness. Not a face detector.
  _LightLine? _judgeLight(CameraImage image) {
    final stats = _faceStats(image);
    if (stats == null) return null;

    if (stats.mean < 50 || stats.darkFraction > 0.45) {
      return const _LightLine('Too dark. Face a window.', false);
    }
    if (stats.mean > 200 || stats.blownFraction > 0.15) {
      return const _LightLine('Too bright. Step out of direct sun.', false);
    }
    if ((stats.leftMean - stats.rightMean).abs() > 30) {
      return const _LightLine('This side is brighter. Turn to face the light.', false);
    }
    return const _LightLine(_good, true);
  }

  _FaceStats? _faceStats(CameraImage image) {
    final width = image.width;
    final height = image.height;
    if (width < 16 || height < 16) return null;

    final boxW = (width * 0.55).round();
    final boxH = (height * 0.46).round();
    final left = ((width - boxW) / 2).round().clamp(0, width - 1);
    final top = (height * 0.16).round().clamp(0, height - 1);
    final right = math.min(width, left + boxW);
    final bottom = math.min(height, top + boxH);
    final midX = left + ((right - left) / 2).round();

    var count = 0;
    var sum = 0.0;
    var dark = 0;
    var blown = 0;
    var leftCount = 0;
    var leftSum = 0.0;
    var rightCount = 0;
    var rightSum = 0.0;

    const stride = 6;
    for (var y = top; y < bottom; y += stride) {
      for (var x = left; x < right; x += stride) {
        final lum = _luminance(image, x, y);
        if (lum == null) return null;
        count++;
        sum += lum;
        if (lum <= 28) dark++;
        if (lum >= 245) blown++;
        if (x < midX) {
          leftCount++;
          leftSum += lum;
        } else {
          rightCount++;
          rightSum += lum;
        }
      }
    }
    if (count < 24 || leftCount < 8 || rightCount < 8) return null;
    final mean = sum / count;
    return _FaceStats(
      mean: mean,
      darkFraction: dark / count,
      blownFraction: blown / count,
      leftMean: leftSum / leftCount,
      rightMean: rightSum / rightCount,
    );
  }

  int? _luminance(CameraImage image, int x, int y) {
    final group = image.format.group;
    if (group == ImageFormatGroup.yuv420) {
      if (image.planes.isEmpty) return null;
      final plane = image.planes.first;
      final index = y * plane.bytesPerRow + x;
      if (index < 0 || index >= plane.bytes.length) return null;
      return plane.bytes[index];
    }
    if (group == ImageFormatGroup.bgra8888) {
      if (image.planes.isEmpty) return null;
      final plane = image.planes.first;
      final bpp = plane.bytesPerPixel ?? 4;
      final index = y * plane.bytesPerRow + x * bpp;
      if (index < 0 || index + 2 >= plane.bytes.length) return null;
      final b = plane.bytes[index];
      final g = plane.bytes[index + 1];
      final r = plane.bytes[index + 2];
      return (0.2126 * r + 0.7152 * g + 0.0722 * b).round();
    }
    return null;
  }

  void _maybeQueueFace(CameraImage image, DateTime now) {
    if (_faceBusy || _gateFallback) return;
    final last = _lastFaceAt;
    if (last != null && now.difference(last).inMilliseconds < 500) return;
    final prepared = _prepareFaceImage(image);
    if (prepared == null) {
      debugPrint('[FoundationCapture] face image unsupported');
      _useWrittenHints();
      return;
    }
    _lastFaceAt = now;
    _faceBusy = true;
    _runFaceCheck(prepared);
  }

  Future<void> _runFaceCheck(_PreparedFace prepared) async {
    try {
      final detector = _faces ??= FaceDetector(
        options: FaceDetectorOptions(
          performanceMode: FaceDetectorMode.fast,
          minFaceSize: 0.12,
        ),
      );
      final faces = await detector.processImage(prepared.image);
      if (!mounted || _busy || _gateFallback || _closing || _released) return;
      final gate = _interpretFaces(faces, prepared);
      _faceFailures = 0;
      _faceOk = gate.ok;
      _faceHint = gate.line;
      _publishGate();
    } catch (e) {
      debugPrint('[FoundationCapture] face check failed: $e');
      _faceFailures++;
      if (_faceFailures >= 3 && mounted && !_closing && !_released) {
        _useWrittenHints();
      }
    } finally {
      _faceBusy = false;
    }
  }

  /// One instruction. Count, then size, then angle, then the oval.
  _FaceGate _interpretFaces(List<Face> faces, _PreparedFace prepared) {
    if (faces.length > 1) {
      return const _FaceGate('One face at a time.', false);
    }
    if (faces.isEmpty) {
      return const _FaceGate('Move your face into the oval.', false);
    }
    final face = faces.first;
    final box = face.boundingBox;
    final ratio = prepared.frameWidth <= 0 ? 0.0 : box.width / prepared.frameWidth;
    if (ratio < skinMinFaceWidthRatio) {
      return const _FaceGate('Move closer.', false);
    }
    final yaw = face.headEulerAngleY;
    final roll = face.headEulerAngleZ;
    if ((yaw != null && yaw.abs() > skinMaxHeadYaw) ||
        (roll != null && roll.abs() > skinMaxHeadRoll)) {
      return const _FaceGate('Face the camera.', false);
    }
    if (!_faceCenterInOval(box, prepared.frameWidth, prepared.frameHeight)) {
      return const _FaceGate('Move your face into the oval.', false);
    }
    return const _FaceGate('Move your face into the oval.', true);
  }

  bool _faceCenterInOval(Rect box, double frameW, double frameH) {
    final view = _viewSize;
    final controller = _controller;
    if (view == null || frameW <= 0 || frameH <= 0 || controller == null) return false;
    if (view.width < 2 || view.height < 2) return false;
    final aspect = _displayedAspect(controller);
    if (aspect == null) return false;
    final preview = _fittedRect(view, aspect);
    var nx = box.center.dx / frameW;
    final ny = box.center.dy / frameH;
    if (_camera?.lensDirection == CameraLensDirection.front) nx = 1 - nx;
    final point = Offset(preview.left + nx * preview.width, preview.top + ny * preview.height);
    return _pointInOval(point, _ovalRect(view));
  }

  double? _displayedAspect(CameraController controller) {
    final ratio = controller.value.aspectRatio;
    if (ratio <= 0) return null;
    final landscape = controller.value.deviceOrientation == DeviceOrientation.landscapeLeft ||
        controller.value.deviceOrientation == DeviceOrientation.landscapeRight;
    return landscape ? ratio : 1 / ratio;
  }

  Rect _fittedRect(Size view, double aspect) {
    final viewAspect = view.width / view.height;
    late double width;
    late double height;
    if (viewAspect > aspect) {
      height = view.height;
      width = height * aspect;
    } else {
      width = view.width;
      height = width / aspect;
    }
    return Rect.fromLTWH((view.width - width) / 2, (view.height - height) / 2, width, height);
  }

  Rect _ovalRect(Size size) {
    return Rect.fromCenter(
      center: Offset(size.width / 2, size.height * 0.42),
      width: size.width * 0.72,
      height: size.height * 0.48,
    );
  }

  bool _pointInOval(Offset point, Rect oval) {
    final rx = oval.width / 2;
    final ry = oval.height / 2;
    if (rx <= 0 || ry <= 0) return false;
    final dx = (point.dx - oval.center.dx) / rx;
    final dy = (point.dy - oval.center.dy) / ry;
    return dx * dx + dy * dy <= 1;
  }

  _PreparedFace? _prepareFaceImage(CameraImage image) {
    final rotation = _inputRotation();
    if (rotation == null || image.width < 16 || image.height < 16) return null;
    final quarterTurn = rotation == InputImageRotation.rotation90deg ||
        rotation == InputImageRotation.rotation270deg;
    final frameWidth = (quarterTurn ? image.height : image.width).toDouble();
    final frameHeight = (quarterTurn ? image.width : image.height).toDouble();

    if (Platform.isIOS) {
      if (image.planes.isEmpty) return null;
      final plane = image.planes.first;
      final bytes = Uint8List.fromList(plane.bytes);
      return _PreparedFace(
        image: InputImage.fromBytes(
          bytes: bytes,
          metadata: InputImageMetadata(
            size: Size(image.width.toDouble(), image.height.toDouble()),
            rotation: rotation,
            format: InputImageFormat.bgra8888,
            bytesPerRow: plane.bytesPerRow,
          ),
        ),
        frameWidth: frameWidth,
        frameHeight: frameHeight,
      );
    }

    final nv21 = _yuv420ToNv21(image);
    if (nv21 == null) return null;
    return _PreparedFace(
      image: InputImage.fromBytes(
        bytes: nv21,
        metadata: InputImageMetadata(
          size: Size(image.width.toDouble(), image.height.toDouble()),
          rotation: rotation,
          format: InputImageFormat.nv21,
          bytesPerRow: image.width,
        ),
      ),
      frameWidth: frameWidth,
      frameHeight: frameHeight,
    );
  }

  InputImageRotation? _inputRotation() {
    final camera = _camera;
    final controller = _controller;
    if (camera == null || controller == null) return null;
    if (Platform.isIOS) {
      return InputImageRotationValue.fromRawValue(camera.sensorOrientation);
    }
    const orientations = <DeviceOrientation, int>{
      DeviceOrientation.portraitUp: 0,
      DeviceOrientation.landscapeLeft: 90,
      DeviceOrientation.portraitDown: 180,
      DeviceOrientation.landscapeRight: 270,
    };
    final compensation = orientations[controller.value.deviceOrientation];
    if (compensation == null) return null;
    final adjusted = camera.lensDirection == CameraLensDirection.front
        ? (camera.sensorOrientation + compensation) % 360
        : (camera.sensorOrientation - compensation + 360) % 360;
    return InputImageRotationValue.fromRawValue(adjusted);
  }

  Uint8List? _yuv420ToNv21(CameraImage image) {
    if (image.planes.length < 3) return null;
    final width = image.width;
    final height = image.height;
    final yPlane = image.planes[0];
    final uPlane = image.planes[1];
    final vPlane = image.planes[2];
    final nv21 = Uint8List(width * height + (width * height ~/ 2));
    var offset = 0;
    final yBytes = yPlane.bytes;
    for (var row = 0; row < height; row++) {
      final start = row * yPlane.bytesPerRow;
      if (start < 0 || start + width > yBytes.length) return null;
      nv21.setRange(offset, offset + width, yBytes, start);
      offset += width;
    }
    final uBytes = uPlane.bytes;
    final vBytes = vPlane.bytes;
    final uStride = uPlane.bytesPerPixel ?? 1;
    final vStride = vPlane.bytesPerPixel ?? 1;
    for (var row = 0; row < height ~/ 2; row++) {
      for (var col = 0; col < width ~/ 2; col++) {
        final uIndex = row * uPlane.bytesPerRow + col * uStride;
        final vIndex = row * vPlane.bytesPerRow + col * vStride;
        if (uIndex < 0 || vIndex < 0 || uIndex >= uBytes.length || vIndex >= vBytes.length) {
          return null;
        }
        nv21[offset++] = vBytes[vIndex];
        nv21[offset++] = uBytes[uIndex];
      }
    }
    return nv21;
  }

  void _fail(String message, String hint) {
    if (!mounted) return;
    setState(() {
      _error = message;
      _hint = hint;
    });
  }

  Future<void> _stopStream() async {
    final controller = _controller;
    if (controller == null) return;
    try {
      if (controller.value.isStreamingImages) {
        await controller.stopImageStream();
      }
    } catch (e) {
      debugPrint('[FoundationCapture] stop stream: $e');
    }
  }

  Future<void> _capture() async {
    final controller = _controller;
    if (controller == null || _busy || !_ready || !controller.value.isInitialized) return;
    setState(() {
      _busy = true;
      _status = 'Hold steady…';
    });
    await _stopStream();
    try {
      await controller.setFlashMode(FlashMode.off);
    } catch (_) {}
    try {
      await controller.setFocusMode(FocusMode.locked);
    } catch (_) {}
    try {
      await controller.setExposureMode(ExposureMode.locked);
    } catch (_) {}

    final paths = <String>[];
    Object? lastError;
    for (var i = 0; i < 3; i++) {
      if (!mounted) return;
      setState(() => _taken = i + 1);
      try {
        final shot = await controller.takePicture();
        paths.add(shot.path);
      } catch (e) {
        lastError = e;
        await _stopStream();
        try {
          final shot = await controller.takePicture();
          paths.add(shot.path);
          lastError = null;
        } catch (again) {
          lastError = again;
          break;
        }
      }
      if (i < 2) {
        await Future<void>.delayed(const Duration(milliseconds: 160));
      }
    }

    if (!mounted) return;
    if (paths.isEmpty) {
      debugPrint('[FoundationCapture] shutter failed: $lastError');
      setState(() {
        _busy = false;
        _taken = 0;
        _ready = _gateFallback;
        _status = _gateFallback
            ? _fallbackLine
            : 'That shot did not save. Hold steady and try again.';
      });
      if (!_gateFallback) {
        try {
          await controller.startImageStream(_onPreview);
        } catch (_) {
          _useWrittenHints();
        }
      }
      return;
    }
    await _close(FoundationCaptureResult(paths: paths));
  }

  /// Releases the plugin camera, then pops. A back press during the shutter
  /// waits; that capture finishes and closes itself.
  Future<void> _close([FoundationCaptureResult? result]) async {
    if (_closing) return;
    if (_busy && result == null) return;
    _closing = true;
    await _releaseCamera();
    if (!mounted) return;
    final nav = Navigator.of(context);
    if (nav.canPop()) nav.pop(result);
  }

  @override
  Widget build(BuildContext context) {
    AppColors.watch(context);
    final controller = _controller;
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (didPop) return;
        _close();
      },
      child: Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        elevation: 0,
        title: const Text('Line your face up'),
      ),
      body: _error != null
          ? _ErrorBody(
              message: _error!,
              hint: _hint,
              onClose: () => _close(FoundationCaptureResult(error: _error, hint: _hint)),
              onGallery: () => _close(const FoundationCaptureResult(chooseGallery: true)),
            )
          : controller == null || !controller.value.isInitialized
              ? const Center(child: CircularProgressIndicator(color: Colors.white))
              : LayoutBuilder(
                  builder: (context, constraints) {
                    _viewSize = constraints.biggest;
                    return Stack(
                  fit: StackFit.expand,
                  children: [
                    CameraPreview(controller),
                    const CustomPaint(painter: _OvalGuidePainter()),
                    Align(
                      alignment: Alignment.bottomCenter,
                      child: SafeArea(
                        child: Padding(
                          padding: const EdgeInsets.fromLTRB(24, 0, 24, 20),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                _busy ? 'Photo $_taken of 3' : _status,
                                textAlign: TextAlign.center,
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 15,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                              if (_gateFallback && !_busy) ...[
                                const SizedBox(height: 6),
                                const Text(
                                  'Move to brighter light if the room is dim.',
                                  textAlign: TextAlign.center,
                                  style: TextStyle(color: Colors.white70, fontSize: 13, height: 1.35),
                                ),
                              ],
                              const SizedBox(height: 8),
                              const Text(
                                'Your photo is measured on this phone and is not uploaded. '
                                'Colour numbers are sent to match a shade, and that reading '
                                'can be saved on this phone and to your profile.',
                                textAlign: TextAlign.center,
                                style: TextStyle(color: Colors.white70, fontSize: 12, height: 1.35),
                              ),
                              const SizedBox(height: 16),
                              FilledButton(
                                onPressed: (_busy || !_ready) ? null : _capture,
                                style: FilledButton.styleFrom(
                                  backgroundColor: AppColors.primary,
                                  disabledBackgroundColor: Colors.white24,
                                  minimumSize: const Size.fromHeight(48),
                                ),
                                child: Text(_busy ? 'Capturing…' : 'Capture'),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ],
                    );
                  },
                ),
      ),
    );
  }
}

class _FaceStats {
  const _FaceStats({
    required this.mean,
    required this.darkFraction,
    required this.blownFraction,
    required this.leftMean,
    required this.rightMean,
  });

  final double mean;
  final double darkFraction;
  final double blownFraction;
  final double leftMean;
  final double rightMean;
}

class _ErrorBody extends StatelessWidget {
  const _ErrorBody({
    required this.message,
    required this.hint,
    required this.onClose,
    required this.onGallery,
  });

  final String message;
  final String? hint;
  final VoidCallback onClose;
  final VoidCallback onGallery;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(28),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            message,
            textAlign: TextAlign.center,
            style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w600),
          ),
          if (hint != null) ...[
            const SizedBox(height: 10),
            Text(hint!, textAlign: TextAlign.center, style: const TextStyle(color: Colors.white70)),
          ],
          const SizedBox(height: 24),
          FilledButton(
            onPressed: onGallery,
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.primary,
              minimumSize: const Size.fromHeight(48),
            ),
            child: const Text('Choose from gallery'),
          ),
          const SizedBox(height: 8),
          TextButton(onPressed: onClose, child: const Text('Back')),
        ],
      ),
    );
  }
}

class _OvalGuidePainter extends CustomPainter {
  const _OvalGuidePainter();

  @override
  void paint(Canvas canvas, Size size) {
    final oval = Rect.fromCenter(
      center: Offset(size.width / 2, size.height * 0.42),
      width: size.width * 0.72,
      height: size.height * 0.48,
    );
    final shade = Paint()..color = Colors.black54;
    final path = Path()
      ..addRect(Offset.zero & size)
      ..addOval(oval)
      ..fillType = PathFillType.evenOdd;
    canvas.drawPath(path, shade);
    canvas.drawOval(
      oval,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2
        ..color = Colors.white,
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

/// Shown only when automatic paper detection misses. The user taps the sheet.
class PaperTapScreen extends StatefulWidget {
  const PaperTapScreen({super.key, required this.imagePath});

  final String imagePath;

  @override
  State<PaperTapScreen> createState() => _PaperTapScreenState();
}

class _PaperTapScreenState extends State<PaperTapScreen> {
  String? _error;

  Future<void> _tap(TapUpDetails details, BoxConstraints constraints) async {
    final image = File(widget.imagePath);
    if (!await image.exists()) {
      setState(() => _error = "That photo couldn't be opened. Retake it.");
      return;
    }
    // BoxFit.contain inside the constraints. The file's aspect comes from the
    // decoded size via the Image widget's own layout; we re-read it here so the
    // tap maps onto the same pixels the sampler will use.
    final bytes = await image.readAsBytes();
    final codec = await ui.instantiateImageCodec(bytes);
    final frame = await codec.getNextFrame();
    final iw = frame.image.width.toDouble();
    final ih = frame.image.height.toDouble();
    frame.image.dispose();
    codec.dispose();

    final box = Size(constraints.maxWidth, constraints.maxHeight);
    final scale = (box.width / iw) < (box.height / ih) ? box.width / iw : box.height / ih;
    final dw = iw * scale;
    final dh = ih * scale;
    final left = (box.width - dw) / 2;
    final top = (box.height - dh) / 2;
    final local = details.localPosition;
    final nx = (local.dx - left) / dw;
    final ny = (local.dy - top) / dh;
    if (nx < 0 || ny < 0 || nx > 1 || ny > 1) {
      setState(() => _error = 'Tap the white paper, not the border around the photo.');
      return;
    }
    final rgb = await SkinSampler.colorNear(widget.imagePath, nx, ny);
    if (!mounted) return;
    if (rgb == null) {
      setState(() => _error = "Couldn't read that spot. Tap the middle of the paper.");
      return;
    }
    final nav = Navigator.of(context);
    if (nav.canPop()) nav.pop(rgb);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: const Text('Tap the paper'),
      ),
      body: Column(
        children: [
          const Padding(
            padding: EdgeInsets.fromLTRB(20, 8, 20, 8),
            child: Text(
              "The white sheet wasn't found on its own. Tap it. If it still doesn't look white, skip this and the match stays approximate.",
              style: TextStyle(color: Colors.white70, height: 1.35),
            ),
          ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Text(_error!, style: const TextStyle(color: Colors.orangeAccent)),
            ),
          Expanded(
            child: LayoutBuilder(
              builder: (context, constraints) {
                return GestureDetector(
                  onTapUp: (d) => _tap(d, constraints),
                  child: Image.file(
                    File(widget.imagePath),
                    fit: BoxFit.contain,
                    width: constraints.maxWidth,
                    height: constraints.maxHeight,
                  ),
                );
              },
            ),
          ),
          SafeArea(
            child: TextButton(
              onPressed: () {
                final nav = Navigator.of(context);
                if (nav.canPop()) nav.pop();
              },
              child: const Text('Skip paper — use an approximate match'),
            ),
          ),
        ],
      ),
    );
  }
}
