import axios from 'axios';
import fs from 'fs';
import { promises as fsPromises } from 'fs';
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { s3 } from "../config/awsConfig.js";
import path from 'path';
import os from 'os';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

/**
 * Get OpenAI API key from environment variables
 */
const getOpenAIKey = () => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set in environment variables');
  }
  return apiKey;
};

/**
 * Download file from S3 to temporary location
 */
const downloadFromS3 = async (bucket, key) => {
  try {
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    const response = await s3.send(command);
    const chunks = [];
    
    for await (const chunk of response.Body) {
      chunks.push(chunk);
    }
    
    const buffer = Buffer.concat(chunks);
    const tempPath = path.join(os.tmpdir(), `validation-${Date.now()}-${path.basename(key)}`);
    await fsPromises.writeFile(tempPath, buffer);
    
    return tempPath;
  } catch (error) {
    console.error('Error downloading from S3:', error);
    throw error;
  }
};

/**
 * Convert file to base64 for OpenAI Vision API
 */
const fileToBase64 = async (filePath) => {
  try {
    const fileBuffer = await fsPromises.readFile(filePath);
    return fileBuffer.toString('base64');
  } catch (error) {
    console.error('Error reading file:', error);
    throw error;
  }
};

/**
 * Get file path - handles both local and S3 files
 */
const getFilePathForValidation = async (doc) => {
  // If we have a local path, use it directly
  if (doc.path && fs.existsSync(doc.path)) {
    return { filePath: doc.path, isTemp: false };
  }
  
  // If we have S3 location/key, download it
  if (doc.location || doc.key || doc.s3Key) {
    const s3Url = doc.location || doc.s3Url;
    const s3Key = doc.key || doc.s3Key;
    const bucket = doc.bucket || process.env.AWS_S3_BUCKET_NAME;
    
    if (!bucket || !s3Key) {
      // Try to extract from URL
      if (s3Url) {
        try {
          const urlObj = new URL(s3Url);
          let bucketName = process.env.AWS_S3_BUCKET_NAME;
          
          if (urlObj.hostname.includes('.s3.')) {
            bucketName = urlObj.hostname.split('.s3.')[0];
          }
          
          const key = urlObj.pathname.startsWith('/') ? urlObj.pathname.slice(1) : urlObj.pathname;
          
          if (bucketName && key) {
            console.log(`📥 [VALIDATION] Downloading from S3: ${bucketName}/${key}`);
            const tempPath = await downloadFromS3(bucketName, key);
            return { filePath: tempPath, isTemp: true };
          }
        } catch (urlError) {
          console.error('Error parsing S3 URL:', urlError);
        }
      }
      throw new Error('Cannot determine S3 bucket or key');
    }
    
    console.log(`📥 [VALIDATION] Downloading from S3: ${bucket}/${s3Key}`);
    const tempPath = await downloadFromS3(bucket, s3Key);
    return { filePath: tempPath, isTemp: true };
  }
  
  throw new Error('No valid file path, S3 location, or S3 key provided');
};

/**
 * Convert PDF to image (first page only) using pdfjs-dist and canvas
 * Returns path to converted image file
 */
export const convertPdfToImage = async (pdfPath) => {
  // Try pdfjs-dist first (faster, works for most PDFs)
  try {
    console.log(`🔄 [VALIDATION] Converting PDF to image using pdfjs-dist: ${pdfPath}`);
    
    // Polyfill Promise methods for Node.js < 22 (required by pdfjs-dist 5.x)
    if (typeof Promise.withResolvers !== 'function') {
      Promise.withResolvers = function() {
        let resolve, reject;
        const promise = new Promise((res, rej) => {
          resolve = res;
          reject = rej;
        });
        return { promise, resolve, reject };
      };
    }
    
    // Polyfill Promise.try (used by pdfjs-dist worker)
    if (typeof Promise.try !== 'function') {
      Promise.try = function(fn) {
        try {
          return Promise.resolve(fn());
        } catch (e) {
          return Promise.reject(e);
        }
      };
    }
    
    // Add browser polyfills for Node.js environment (required for pdfjs-dist 5.x)
    if (typeof global !== 'undefined') {
      // Polyfill DOMMatrix (required by pdfjs-dist 5.x)
      if (!global.DOMMatrix) {
        try {
          const { DOMMatrix, DOMMatrixReadOnly } = await import('@napi-rs/canvas');
          global.DOMMatrix = DOMMatrix;
          global.DOMMatrixReadOnly = DOMMatrixReadOnly;
        } catch (e) {
          // If @napi-rs/canvas doesn't have DOMMatrix, create a simple polyfill
          class DOMMatrixPolyfill {
            constructor(init) {
              if (typeof init === 'string') {
                const values = init.match(/matrix\(([^)]+)\)/)?.[1]?.split(/\s*,\s*/).map(Number) || [];
                this.a = values[0] || 1;
                this.b = values[1] || 0;
                this.c = values[2] || 0;
                this.d = values[3] || 1;
                this.e = values[4] || 0;
                this.f = values[5] || 0;
              } else {
                this.a = init?.a ?? 1;
                this.b = init?.b ?? 0;
                this.c = init?.c ?? 0;
                this.d = init?.d ?? 1;
                this.e = init?.e ?? 0;
                this.f = init?.f ?? 0;
              }
            }
            multiply(other) {
              return new DOMMatrixPolyfill({
                a: this.a * other.a + this.c * other.b,
                b: this.b * other.a + this.d * other.b,
                c: this.a * other.c + this.c * other.d,
                d: this.b * other.c + this.d * other.d,
                e: this.a * other.e + this.c * other.f + this.e,
                f: this.b * other.e + this.d * other.f + this.f
              });
            }
            translate(x, y) {
              return this.multiply(new DOMMatrixPolyfill({ a: 1, b: 0, c: 0, d: 1, e: x, f: y }));
            }
            scale(x, y) {
              return this.multiply(new DOMMatrixPolyfill({ a: x, b: 0, c: 0, d: y, e: 0, f: 0 }));
            }
          }
          global.DOMMatrix = DOMMatrixPolyfill;
          global.DOMMatrixReadOnly = DOMMatrixPolyfill;
        }
      }
      
      // Polyfill other DOM APIs if needed
      if (!global.DOMRect) {
        global.DOMRect = class DOMRect {
          constructor(x = 0, y = 0, width = 0, height = 0) {
            this.x = x;
            this.y = y;
            this.width = width;
            this.height = height;
            this.top = y;
            this.right = x + width;
            this.bottom = y + height;
            this.left = x;
          }
        };
      }
    }
    
    // Import canvas
    const canvasModule = await import('canvas');
    const { createCanvas, Image } = canvasModule;
    
    // Polyfill Path2D for Node.js (required by pdfjs-dist)
    // The canvas library should provide Path2D, but we need to make sure it's available globally
    if (typeof global !== 'undefined' && !global.Path2D) {
      let Path2DFound = false;
      
      // Check if canvas module provides Path2D directly
      if (canvasModule.Path2D) {
        global.Path2D = canvasModule.Path2D;
        Path2DFound = true;
        console.log('✅ Using Path2D from canvas module');
      } else {
        // Try to get Path2D from a canvas instance's context
        try {
          const testCanvas = createCanvas(1, 1);
          const testCtx = testCanvas.getContext('2d');
          
          // Check various possible locations for Path2D
          if (testCtx && testCtx.constructor && testCtx.constructor.Path2D) {
            global.Path2D = testCtx.constructor.Path2D;
            Path2DFound = true;
            console.log('✅ Using Path2D from canvas context constructor');
          } else if (testCtx && testCtx.Path2D) {
            global.Path2D = testCtx.Path2D;
            Path2DFound = true;
            console.log('✅ Using Path2D from canvas context');
          } else if (testCanvas.constructor && testCanvas.constructor.Path2D) {
            global.Path2D = testCanvas.constructor.Path2D;
            Path2DFound = true;
            console.log('✅ Using Path2D from canvas constructor');
          }
        } catch (e) {
          console.log('⚠️ Could not find Path2D in canvas:', e.message);
        }
      }
      
      // If Path2D still not found, create polyfill
      if (!Path2DFound) {
        // Create a simple Path2D polyfill
        console.log('⚠️ Creating Path2D polyfill');
        global.Path2D = class Path2D {
          constructor(path) {
            this._commands = [];
            if (path instanceof Path2D) {
              this._commands = [...path._commands];
            } else if (typeof path === 'string') {
              // SVG path string - simplified parser
              this._commands.push({ type: 'svg', data: path });
            }
          }
          
          addPath(path, transform) {
            if (path instanceof Path2D) {
              this._commands.push({ type: 'addPath', path: path._commands, transform });
            }
          }
          
          arc(x, y, radius, startAngle, endAngle, anticlockwise) {
            this._commands.push({ type: 'arc', x, y, radius, startAngle, endAngle, anticlockwise });
          }
          
          arcTo(x1, y1, x2, y2, radius) {
            this._commands.push({ type: 'arcTo', x1, y1, x2, y2, radius });
          }
          
          bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y) {
            this._commands.push({ type: 'bezierCurveTo', cp1x, cp1y, cp2x, cp2y, x, y });
          }
          
          closePath() {
            this._commands.push({ type: 'closePath' });
          }
          
          ellipse(x, y, radiusX, radiusY, rotation, startAngle, endAngle, anticlockwise) {
            this._commands.push({ type: 'ellipse', x, y, radiusX, radiusY, rotation, startAngle, endAngle, anticlockwise });
          }
          
          lineTo(x, y) {
            this._commands.push({ type: 'lineTo', x, y });
          }
          
          moveTo(x, y) {
            this._commands.push({ type: 'moveTo', x, y });
          }
          
          quadraticCurveTo(cpx, cpy, x, y) {
            this._commands.push({ type: 'quadraticCurveTo', cpx, cpy, x, y });
          }
          
          rect(x, y, width, height) {
            this._commands.push({ type: 'rect', x, y, width, height });
          }
          
          // Apply path to a canvas context
          _applyToContext(ctx) {
            for (const cmd of this._commands) {
              switch (cmd.type) {
                case 'moveTo':
                  ctx.moveTo(cmd.x, cmd.y);
                  break;
                case 'lineTo':
                  ctx.lineTo(cmd.x, cmd.y);
                  break;
                case 'arc':
                  ctx.arc(cmd.x, cmd.y, cmd.radius, cmd.startAngle, cmd.endAngle, cmd.anticlockwise);
                  break;
                case 'arcTo':
                  ctx.arcTo(cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.radius);
                  break;
                case 'bezierCurveTo':
                  ctx.bezierCurveTo(cmd.cp1x, cmd.cp1y, cmd.cp2x, cmd.cp2y, cmd.x, cmd.y);
                  break;
                case 'quadraticCurveTo':
                  ctx.quadraticCurveTo(cmd.cpx, cmd.cpy, cmd.x, cmd.y);
                  break;
                case 'rect':
                  ctx.rect(cmd.x, cmd.y, cmd.width, cmd.height);
                  break;
                case 'ellipse':
                  ctx.ellipse(cmd.x, cmd.y, cmd.radiusX, cmd.radiusY, cmd.rotation, cmd.startAngle, cmd.endAngle, cmd.anticlockwise);
                  break;
                case 'closePath':
                  ctx.closePath();
                  break;
                case 'addPath':
                  ctx.save();
                  if (cmd.transform) {
                    ctx.transform(cmd.transform.a, cmd.transform.b, cmd.transform.c, cmd.transform.d, cmd.transform.e, cmd.transform.f);
                  }
                  // Recursively apply path commands
                  const tempPath = new Path2D();
                  tempPath._commands = cmd.path;
                  tempPath._applyToContext(ctx);
                  ctx.restore();
                  break;
                case 'svg':
                  // For SVG paths, try to parse and apply (simplified)
                  try {
                    ctx.beginPath();
                    // Basic SVG path parsing - simplified
                    const svgPath = cmd.data;
                    const commands = svgPath.match(/[MmLlHhVvCcSsQqTtAaZz][^MmLlHhVvCcSsQqTtAaZz]*/g) || [];
                    for (const svgCmd of commands) {
                      const type = svgCmd[0];
                      const coords = svgCmd.slice(1).trim().split(/[\s,]+/).map(Number).filter(n => !isNaN(n));
                      switch (type) {
                        case 'M':
                          ctx.moveTo(coords[0], coords[1]);
                          break;
                        case 'L':
                          ctx.lineTo(coords[0], coords[1]);
                          break;
                        case 'Z':
                        case 'z':
                          ctx.closePath();
                          break;
                      }
                    }
                  } catch (e) {
                    console.warn('Failed to parse SVG path:', e);
                  }
                  break;
              }
            }
          }
        };
      }
    }
    
    // Import pdfjs-dist - USE LEGACY BUILD for Node.js (as recommended by pdfjs-dist)
    let pdfjsLib;
    try {
      // Use legacy build first (recommended for Node.js environments)
      const pdfjsModule = await import('pdfjs-dist/legacy/build/pdf.mjs');
      pdfjsLib = pdfjsModule.default || pdfjsModule;
      console.log('✅ [VALIDATION] Using pdfjs-dist legacy build for Node.js');
    } catch (e1) {
      console.error('Error importing pdfjs-dist legacy build:', e1.message);
      try {
        // Fallback to main module
        const pdfjsModule = await import('pdfjs-dist');
        pdfjsLib = pdfjsModule.default || pdfjsModule;
        
        // Check if getDocument exists
        if (!pdfjsLib.getDocument) {
          if (pdfjsModule.getDocument) {
            pdfjsLib = pdfjsModule;
          } else {
            const { getDocument } = pdfjsModule;
            if (getDocument) {
              pdfjsLib = { getDocument, ...pdfjsModule };
            }
          }
        }
        console.log('⚠️ [VALIDATION] Using pdfjs-dist main build (legacy recommended)');
      } catch (e2) {
        console.error('Error importing pdfjs-dist main module:', e2.message);
        throw new Error(`pdfjs-dist library not found or cannot be imported. Please ensure pdfjs-dist is installed: npm install pdfjs-dist. Errors: ${e1.message}, ${e2.message}`);
      }
    }

    if (!pdfjsLib || !pdfjsLib.getDocument) {
      console.error('pdfjsLib structure:', Object.keys(pdfjsLib || {}));
      console.error('pdfjsLib type:', typeof pdfjsLib);
      throw new Error('pdfjs-dist library not properly loaded - getDocument method not found. Available methods: ' + Object.keys(pdfjsLib || {}).join(', '));
    }
    
    // Make Image class available globally for pdfjs-dist to use when handling embedded images
    // This is needed because pdfjs-dist expects Image objects for embedded images
    if (typeof global !== 'undefined' && !global.Image) {
      global.Image = Image;
    }

    // Read PDF file and convert Buffer to Uint8Array
    const pdfBuffer = await fsPromises.readFile(pdfPath);
    // pdfjs-dist requires Uint8Array, not Buffer
    const pdfData = new Uint8Array(pdfBuffer);
    
    // Load PDF document with canvas factory and image handler for embedded images
    const loadingTask = pdfjsLib.getDocument({ 
      data: pdfData,
      verbosity: 0, // Suppress warnings
      // Provide canvas factory for handling embedded images
      canvasFactory: {
        create: (width, height) => {
          const canvas = createCanvas(width, height);
          return {
            canvas,
            context: canvas.getContext('2d')
          };
        },
        reset: (canvasAndContext, width, height) => {
          canvasAndContext.canvas.width = width;
          canvasAndContext.canvas.height = height;
        },
        destroy: (canvasAndContext) => {
          canvasAndContext.canvas.width = 0;
          canvasAndContext.canvas.height = 0;
        }
      }
    });
    const pdfDocument = await loadingTask.promise;
    
    // Get first page (page numbers are 1-indexed)
    const page = await pdfDocument.getPage(1);
    
    // Set scale for high quality (2x for 300 DPI equivalent)
    const scale = 2.0;
    const viewport = page.getViewport({ scale });
    
    // Create canvas
    const canvas = createCanvas(Math.floor(viewport.width), Math.floor(viewport.height));
    const context = canvas.getContext('2d');
    
    // Render PDF page to canvas
    const renderContext = {
      canvasContext: context,
      viewport: viewport
    };
    
    await page.render(renderContext).promise;
    
    // Generate output path
    const outputDir = path.join(os.tmpdir(), 'pdf-conversions');
    await fsPromises.mkdir(outputDir, { recursive: true });
    
    const outputPath = path.join(outputDir, `${path.basename(pdfPath, path.extname(pdfPath))}_${Date.now()}.png`);
    
    // Save canvas as PNG
    const buffer = canvas.toBuffer('image/png');
    await fsPromises.writeFile(outputPath, buffer);
    
    console.log(`✅ [VALIDATION] PDF converted to image using pdfjs-dist: ${outputPath} (${buffer.length} bytes)`);
    return outputPath;
  } catch (error) {
    // If pdfjs-dist fails (especially with embedded images), try pdf-image as fallback
    if (error.message && error.message.includes('Image or Canvas expected')) {
      console.log(`⚠️ [VALIDATION] pdfjs-dist failed with embedded images, trying pdf-image fallback...`);
      return await convertPdfToImageWithPdfImage(pdfPath);
    }
    
    // For other errors, also try pdf-image as fallback
    console.log(`⚠️ [VALIDATION] pdfjs-dist conversion failed, trying pdf-image fallback...`);
    try {
      return await convertPdfToImageWithPdfImage(pdfPath);
    } catch (fallbackError) {
      // If both fail, throw the original error
      console.error(`❌ [VALIDATION] Error converting PDF to image:`, error.message);
      console.error(`❌ [VALIDATION] Error stack:`, error.stack);
      throw new Error(`Failed to convert page to image: ${error.message}`);
    }
  }
};

/**
 * Fallback PDF to image conversion using pdf-image (requires ImageMagick)
 * This handles PDFs with embedded images better than pdfjs-dist
 */
const convertPdfToImageWithPdfImage = async (pdfPath) => {
  try {
    console.log(`🔄 [VALIDATION] Converting PDF to image using ImageMagick magick: ${pdfPath}`);
    
    // Import child_process to run magick command directly
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const execFileAsync = promisify(execFile);
    
    // Find ImageMagick command (works on both Windows and Linux)
    // On Linux: use 'magick' or 'convert' from PATH
    // On Windows: check common installation paths
    const isWindows = process.platform === 'win32';
    let magickPath = null;
    
    if (isWindows) {
      // Windows: check common installation paths
      const possibleMagickPaths = [
        'C:\\Program Files\\ImageMagick-7.1.2-Q16-HDRI\\magick.exe',
        'C:\\Program Files\\ImageMagick-7.1.1-Q16-HDRI\\magick.exe',
        'C:\\Program Files\\ImageMagick-7.1.0-Q16-HDRI\\magick.exe',
        'C:\\Program Files (x86)\\ImageMagick-7.1.2-Q16-HDRI\\magick.exe',
        'C:\\Program Files (x86)\\ImageMagick-7.1.1-Q16-HDRI\\magick.exe',
        'C:\\Program Files (x86)\\ImageMagick-7.1.0-Q16-HDRI\\magick.exe'
      ];
      
      for (const possiblePath of possibleMagickPaths) {
        if (fs.existsSync(possiblePath)) {
          magickPath = possiblePath;
          console.log(`✅ [VALIDATION] Found ImageMagick magick.exe at: ${magickPath}`);
          break;
        }
      }
    } else {
      // Linux/Unix: try 'magick' first (ImageMagick 7.x), then 'convert' (ImageMagick 6.x)
      const { execSync } = await import('child_process');
      try {
        execSync('which magick', { stdio: 'ignore' });
        magickPath = 'magick';
        console.log(`✅ [VALIDATION] Found ImageMagick 'magick' command in PATH`);
      } catch (e) {
        try {
          execSync('which convert', { stdio: 'ignore' });
          magickPath = 'convert';
          console.log(`✅ [VALIDATION] Found ImageMagick 'convert' command in PATH`);
        } catch (e2) {
          // Neither found
        }
      }
    }
    
    if (!magickPath) {
      throw new Error('ImageMagick not found. Please ensure ImageMagick is installed. On Linux: sudo apt-get install imagemagick ghostscript');
    }
    
    // Generate output directory and file path
    const outputDir = path.join(os.tmpdir(), 'pdf-conversions');
    await fsPromises.mkdir(outputDir, { recursive: true });
    
    const outputPath = path.join(outputDir, `${path.basename(pdfPath, path.extname(pdfPath))}_${Date.now()}.png`);
    
    // Use magick directly (not "magick convert" - that's deprecated in IMv7)
    // Format: magick input.pdf[0] -quality 100 -density 200 -colorspace RGB output.png
    // [0] means first page only
    const args = [
      `${pdfPath}[0]`, // First page only
      '-quality', '100',
      '-density', '200',
      '-colorspace', 'RGB',
      outputPath
    ];
    
    console.log(`🔄 [VALIDATION] Running: ${magickPath} ${args.join(' ')}`);
    
    await execFileAsync(magickPath, args, {
      timeout: 30000, // 30 second timeout
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer
    });
    
    // Verify output file was created
    if (!fs.existsSync(outputPath)) {
      throw new Error('ImageMagick conversion completed but output file was not created');
    }
    
    const stats = await fsPromises.stat(outputPath);
    console.log(`✅ [VALIDATION] PDF converted to image using ImageMagick: ${outputPath} (${stats.size} bytes)`);
    return outputPath;
  } catch (error) {
    console.error(`❌ [VALIDATION] Error converting PDF with ImageMagick:`, error.message);
    console.error(`❌ [VALIDATION] Error stack:`, error.stack);
    
    // Provide helpful error message
    if (error.message && (error.message.includes('gswin64c.exe') || error.message.includes('ghostscript') || error.message.includes('Ghostscript') || error.message.includes('PDFDelegateFailed'))) {
      throw new Error(`PDF conversion requires Ghostscript to be installed. ImageMagick is installed but Ghostscript (gswin64c.exe) is missing. Please install Ghostscript from https://www.ghostscript.com/download/gsdnld.html and restart the server.`);
    }
    
    if (error.message && (error.message.includes('ImageMagick') || error.message.includes('convert') || error.message.includes('spawn') || error.message.includes('ENOENT') || error.message.includes('not found'))) {
      throw new Error(`PDF conversion requires ImageMagick to be installed. ImageMagick magick.exe was not found in the expected locations. Please ensure ImageMagick is installed and restart the server.`);
    }
    
    throw error;
  }
};

/**
 * Get MIME type from file extension
 */
const getMimeType = (filename) => {
  const ext = filename.split('.').pop()?.toLowerCase();
  const mimeTypes = {
    'pdf': 'application/pdf',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'bmp': 'image/bmp',
    'webp': 'image/webp',
    'txt': 'text/plain',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  };
  return mimeTypes[ext] || 'application/octet-stream';
};

/**
 * Validate documents for orders using AI
 * @param {Array} documents - Array of document objects with file paths and metadata
 * @param {string} context - 'order' or 'trip'
 * @param {object} orderOrTripData - Order or trip data for context
 * @returns {Promise<object>} Validation results
 */
export const validateDocuments = async (documents, context = 'order', orderOrTripData = {}) => {
  try {
    console.log(`🔍 [VALIDATION] Starting validation for ${documents?.length || 0} document(s) in ${context} context`);
    
    if (!documents || documents.length === 0) {
      console.log('⚠️ [VALIDATION] No documents provided');
      return {
        success: true,
        valid: true,
        warnings: [],
        errors: [],
        missing: [],
        message: 'No documents to validate'
      };
    }

    console.log(`🔑 [VALIDATION] Getting OpenAI API key...`);
    let apiKey;
    try {
      apiKey = getOpenAIKey();
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY is empty or undefined');
      }
      console.log(`✅ [VALIDATION] API key obtained (length: ${apiKey.length})`);
    } catch (keyError) {
      console.error(`❌ [VALIDATION] Failed to get OpenAI API key:`, keyError.message);
      return {
        success: false,
        valid: false,
        warnings: [],
        errors: [{
          message: `OpenAI API key not configured: ${keyError.message}. Please set OPENAI_API_KEY in environment variables.`
        }],
        missing: [],
        message: 'Document validation failed: OpenAI API key not configured',
        documentDetails: []
      };
    }
    const validationResults = {
      success: true,
      valid: true,
      warnings: [],
      errors: [],
      missing: [],
      documentDetails: []
    };

    // Define required documents based on context
    const requiredDocs = {
      order: ['bol'], // Bill of Lading is typically required for orders
      trip: [] // Trips may have optional documents
    };

    const requiredForContext = requiredDocs[context] || [];

    // Check for missing required documents
    const uploadedDocTypes = documents.map(doc => doc.type || doc.documentType || 'unknown').map(t => t.toLowerCase());
    requiredForContext.forEach(reqDoc => {
      if (!uploadedDocTypes.includes(reqDoc.toLowerCase())) {
        validationResults.missing.push({
          type: reqDoc,
          message: `Required document ${reqDoc.toUpperCase()} is missing`
        });
        validationResults.valid = false;
      }
    });

    // Validate each document using AI
    for (const doc of documents) {
      const fileName = doc.originalname || doc.filename || doc.name || 'unknown';
      const docType = doc.type || doc.documentType || 'unknown';
      const mimeType = getMimeType(fileName);

      console.log(`📄 [VALIDATION] Processing document: ${fileName}, type: ${docType}`);
      console.log(`📄 [VALIDATION] File info:`, {
        hasPath: !!doc.path,
        hasLocation: !!doc.location,
        hasKey: !!doc.key,
        hasS3Key: !!doc.s3Key
      });

      let filePath;
      let isTempFile = false;
      
      try {
        const fileInfo = await getFilePathForValidation(doc);
        filePath = fileInfo.filePath;
        isTempFile = fileInfo.isTemp;
        console.log(`✅ [VALIDATION] File accessible: ${filePath} (temp: ${isTempFile})`);
      } catch (fileError) {
        console.error(`❌ [VALIDATION] Cannot access file for ${fileName}:`, fileError.message);
        validationResults.errors.push({
          document: fileName,
          type: docType,
          message: `Cannot access file: ${fileError.message}`
        });
        validationResults.valid = false;
        continue;
      }

      // Only validate images with Vision API (PDFs need to be converted first)
      const isImage = mimeType.startsWith('image/');
      const isPDF = mimeType === 'application/pdf';

      // Convert PDFs to images before validation
      let imagePath = filePath;
      let isConvertedImage = false;
      let convertedImagePath = null;
      let shouldValidateAsImage = isImage; // Track if we should validate as image

      if (isPDF) {
        try {
          console.log(`📄 [VALIDATION] Converting PDF to image for validation: ${fileName}`);
          convertedImagePath = await convertPdfToImage(filePath);
          imagePath = convertedImagePath;
          isConvertedImage = true;
          shouldValidateAsImage = true; // After conversion, treat as image
          console.log(`✅ [VALIDATION] PDF converted successfully, using image: ${imagePath}`);
        } catch (conversionError) {
          console.error(`❌ [VALIDATION] Failed to convert PDF to image:`, conversionError.message);
          validationResults.warnings.push({
            document: fileName,
            type: docType,
            message: `PDF conversion failed: ${conversionError.message}. Please verify manually or convert PDF to image format.`
          });
          validationResults.documentDetails.push({
            document: fileName,
            type: docType,
            status: 'warning',
            validated: false,
            issues: [`PDF conversion error: ${conversionError.message}`]
          });
          // Clean up temp file if it was downloaded
          if (isTempFile && fs.existsSync(filePath)) {
            await fsPromises.unlink(filePath);
            console.log(`🗑️ [VALIDATION] Cleaned up temp file: ${filePath}`);
          }
          continue;
        }
      }

      if (!shouldValidateAsImage) {
        // For non-image files, do basic validation
        validationResults.warnings.push({
          document: fileName,
          type: docType,
          message: `Document type ${mimeType} cannot be fully validated. Please verify manually.`
        });
        validationResults.documentDetails.push({
          document: fileName,
          type: docType,
          status: 'warning',
          validated: false,
          issues: ['File type not supported for AI validation']
        });
        // Clean up temp file if it was downloaded
        if (isTempFile && fs.existsSync(filePath)) {
          await fsPromises.unlink(filePath);
          console.log(`🗑️ [VALIDATION] Cleaned up temp file: ${filePath}`);
        }
        continue;
      }

      try {
        console.log(`📤 [VALIDATION] Converting ${isConvertedImage ? 'converted image' : fileName} to base64...`);
        // Convert file to base64 (use converted image if PDF was converted)
        const base64File = await fileToBase64(imagePath);
        console.log(`✅ [VALIDATION] File converted (${base64File.length} chars)`);
        
        // Use image MIME type for converted PDFs, otherwise use original mimeType
        const finalMimeType = isConvertedImage ? 'image/png' : mimeType;

        // Build validation prompt based on document type
        const validationPrompt = buildValidationPrompt(docType, context, orderOrTripData);
        console.log(`📝 [VALIDATION] Prompt built for ${docType} in ${context}`);

        // Call OpenAI Vision API
        console.log(`🚀 [VALIDATION] Calling OpenAI Vision API for ${fileName}...`);
        console.log(`🔗 [VALIDATION] API URL: ${OPENAI_API_URL}`);
        console.log(`🔑 [VALIDATION] API Key present: ${apiKey ? 'Yes (length: ' + apiKey.length + ')' : 'No'}`);
        
        let response;
        try {
          response = await axios.post(
            OPENAI_API_URL,
            {
              model: 'gpt-4o', // Use vision-capable model
              messages: [
                {
                  role: 'system',
                  content: 'You are an expert document validation assistant for logistics and transportation. Analyze documents and identify issues such as missing information, incorrect data, expired dates, or mismatched content. Always identify the actual document type first before validating.'
                },
                {
                  role: 'user',
                  content: [
                    {
                      type: 'text',
                      text: validationPrompt
                    },
                    {
                      type: 'image_url',
                      image_url: {
                        url: `data:${finalMimeType};base64,${base64File}`
                      }
                    }
                  ]
                }
              ],
              max_tokens: 2000,
              temperature: 0.2,
              response_format: { type: 'json_object' }
            },
            {
              headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
              },
              timeout: 60000 // 60 seconds timeout
            }
          );
          
          console.log(`✅ [VALIDATION] OpenAI API call successful for ${fileName}`);
          console.log(`📥 [VALIDATION] Response status: ${response.status}`);
        } catch (apiError) {
          console.error(`OpenAI API error for ${fileName}:`, apiError.response?.data || apiError.message);
          const errorMsg = apiError.response?.data?.error?.message || apiError.message || 'Unknown error';
          validationResults.warnings.push({
            document: fileName,
            type: docType,
            message: `AI validation API error: ${errorMsg}`
          });
          validationResults.documentDetails.push({
            document: fileName,
            type: docType,
            status: 'warning',
            validated: false,
            issues: [`AI API call failed: ${errorMsg}`]
          });
          continue;
        }

        const aiResponse = response.data.choices[0]?.message?.content;
        if (!aiResponse) {
          console.error(`No AI response content for ${fileName}`);
          validationResults.warnings.push({
            document: fileName,
            type: docType,
            message: 'AI validation could not analyze this document - no response received'
          });
          validationResults.documentDetails.push({
            document: fileName,
            type: docType,
            status: 'warning',
            validated: false,
            issues: ['No AI response received']
          });
          continue;
        }

        // Parse AI response
        let validationResult;
        try {
          validationResult = typeof aiResponse === 'string' ? JSON.parse(aiResponse) : aiResponse;
        } catch (parseError) {
          console.error(`Error parsing AI validation response for ${fileName}:`, parseError);
          console.error('AI Response:', aiResponse);
          validationResults.warnings.push({
            document: fileName,
            type: docType,
            message: 'Failed to parse AI validation response. Document may not be properly validated.'
          });
          validationResults.documentDetails.push({
            document: fileName,
            type: docType,
            status: 'warning',
            validated: false,
            issues: ['AI response parsing failed']
          });
          continue;
        }

        // Check for document type mismatch (CRITICAL ERROR)
        if (validationResult.actualDocumentType && validationResult.expectedDocumentType) {
          const actualType = validationResult.actualDocumentType.toLowerCase();
          const expectedType = validationResult.expectedDocumentType.toLowerCase();
          
          // Check if document type matches
          if (validationResult.documentTypeMatch === false || 
              (!actualType.includes(expectedType) && !expectedType.includes(actualType))) {
            validationResults.valid = false;
            validationResults.errors.push({
              document: fileName,
              type: docType,
              message: `Document type mismatch: Expected ${validationResult.expectedDocumentType} but document is actually ${validationResult.actualDocumentType}. This document is not appropriate for ${context}.`,
              issues: [`Wrong document type: ${validationResult.actualDocumentType} instead of ${validationResult.expectedDocumentType}`, ...(validationResult.issues || [])]
            });
            // Continue to process other validation results but mark as invalid
          }
        }

        // Process validation results
        if (validationResult.valid === false) {
          validationResults.valid = false;
          // Only add error if not already added for type mismatch
          const hasTypeMismatchError = validationResults.errors.some(e => 
            e.document === fileName && e.message.includes('Document type mismatch')
          );
          
          if (!hasTypeMismatchError) {
            validationResults.errors.push({
              document: fileName,
              type: docType,
              message: validationResult.reason || 'Document validation failed',
              issues: validationResult.issues || []
            });
          }
        }

        if (validationResult.warnings && validationResult.warnings.length > 0) {
          validationResult.warnings.forEach(warning => {
            validationResults.warnings.push({
              document: fileName,
              type: docType,
              message: warning
            });
          });
        }

        // Check for expiration dates
        if (validationResult.expirationDate) {
          const expDate = new Date(validationResult.expirationDate);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          
          if (expDate < today) {
            validationResults.errors.push({
              document: fileName,
              type: docType,
              message: `Document expired on ${expDate.toLocaleDateString()}`,
              issues: ['Expired document']
            });
            validationResults.valid = false;
          } else {
            const daysUntilExpiry = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));
            if (daysUntilExpiry <= 30) {
              validationResults.warnings.push({
                document: fileName,
                type: docType,
                message: `Document expires in ${daysUntilExpiry} days (${expDate.toLocaleDateString()})`
              });
            }
          }
        }

        // Store document details
        validationResults.documentDetails.push({
          document: fileName,
          type: docType,
          actualType: validationResult.actualDocumentType || docType,
          typeMatch: validationResult.documentTypeMatch !== false,
          status: validationResult.valid && validationResult.documentTypeMatch !== false ? 'valid' : 'invalid',
          validated: true,
          issues: validationResult.issues || [],
          expirationDate: validationResult.expirationDate || null,
          extractedInfo: validationResult.extractedInfo || null
        });

      } catch (docError) {
        console.error(`Error validating document ${fileName}:`, docError);
        validationResults.warnings.push({
          document: fileName,
          type: docType,
          message: `Failed to validate document: ${docError.message || 'Unknown error'}`
        });
      } finally {
        // Clean up converted image if PDF was converted
        if (isConvertedImage && convertedImagePath && fs.existsSync(convertedImagePath)) {
          try {
            await fsPromises.unlink(convertedImagePath);
            console.log(`🗑️ [VALIDATION] Cleaned up converted image: ${convertedImagePath}`);
          } catch (cleanupError) {
            console.warn(`⚠️ [VALIDATION] Failed to cleanup converted image: ${cleanupError.message}`);
          }
        }
        // Clean up temporary file if it was downloaded from S3
        if (isTempFile && filePath && fs.existsSync(filePath)) {
          try {
            await fsPromises.unlink(filePath);
            console.log(`🗑️ [VALIDATION] Cleaned up temp file: ${filePath}`);
          } catch (cleanupError) {
            console.warn(`⚠️ [VALIDATION] Failed to cleanup temp file ${filePath}:`, cleanupError.message);
          }
        }
      }
    }

    // Generate summary message
    if (validationResults.errors.length > 0) {
      validationResults.message = `Validation failed: ${validationResults.errors.length} error(s) found`;
    } else if (validationResults.warnings.length > 0) {
      validationResults.message = `Validation completed with ${validationResults.warnings.length} warning(s)`;
    } else if (validationResults.missing.length > 0) {
      validationResults.message = `Missing ${validationResults.missing.length} required document(s)`;
    } else {
      validationResults.message = 'All documents validated successfully';
    }

    console.log(`📊 [VALIDATION] Summary for ${context}:`, {
      valid: validationResults.valid,
      errors: validationResults.errors.length,
      warnings: validationResults.warnings.length,
      missing: validationResults.missing.length,
      message: validationResults.message
    });
    
    if (validationResults.errors.length > 0) {
      console.error(`❌ [VALIDATION] ERRORS:`, validationResults.errors);
    }
    if (validationResults.warnings.length > 0) {
      console.warn(`⚠️ [VALIDATION] WARNINGS:`, validationResults.warnings);
    }

    return validationResults;

  } catch (error) {
    console.error('Error in validateDocuments:', error);
    return {
      success: false,
      valid: false,
      warnings: [],
      errors: [{
        message: `Validation error: ${error.message || 'Unknown error'}`
      }],
      missing: [],
      message: 'Document validation failed due to system error'
    };
  }
};

/**
 * Build validation prompt based on document type and context
 */
const buildValidationPrompt = (docType, context, orderOrTripData) => {
  const docTypeLower = docType.toLowerCase();
  
  let prompt = `Analyze this ${docType} document and validate it for a ${context}. `;
  
  // Add context-specific requirements
  if (context === 'order') {
    prompt += `This document is for an order. `;
    if (orderOrTripData.orderNumber) {
      prompt += `Order Number: ${orderOrTripData.orderNumber}. `;
    }
    if (orderOrTripData.customer) {
      prompt += `Customer: ${orderOrTripData.customer}. `;
    }
  } else if (context === 'trip') {
    prompt += `This document is for a trip. `;
    if (orderOrTripData.tripNumber) {
      prompt += `Trip Number: ${orderOrTripData.tripNumber}. `;
    }
  }

  // Document-specific validation requirements
  if (docTypeLower.includes('bol') || docTypeLower.includes('bill of lading')) {
    prompt += `For Bill of Lading (BOL), check:
- All required fields are present (shipper, receiver, commodity, weight, etc.)
- Dates are valid and not expired
- Signatures are present if required
- Document matches the order/trip information provided
- No obvious errors or inconsistencies`;
  } else if (docTypeLower.includes('pod') || docTypeLower.includes('proof of delivery')) {
    prompt += `For Proof of Delivery (POD), check:
- Delivery date and time are present
- Receiver signature is present
- Delivery location matches
- No damage or exceptions noted (or if noted, properly documented)
- Document is not expired`;
  } else if (docTypeLower.includes('manifest')) {
    prompt += `For Manifest, check:
- All items/orders listed are present
- Quantities and weights match
- Stamps or approvals are present if required
- Document is current and not expired`;
  } else if (docTypeLower.includes('customs') || docTypeLower.includes('hazmat')) {
    prompt += `For Customs/Hazmat document, check:
- All required customs information is present
- Hazmat classification is correct if applicable
- Expiration dates are valid
- Required approvals or stamps are present`;
  } else if (docTypeLower.includes('rate') || docTypeLower.includes('confirmation')) {
    prompt += `For Rate Confirmation, check:
- Rate information is clearly stated
- Terms and conditions are present
- Dates are valid
- Signatures or approvals are present if required`;
  } else {
    prompt += `Check:
- Document is complete and readable
- All required information is present
- Dates are valid and not expired
- Document matches the ${context} information
- No obvious errors or inconsistencies`;
  }

  prompt += `

CRITICAL: First, identify what type of document this actually is by analyzing its content. Common document types include:
- Bill of Lading (BOL)
- Proof of Delivery (POD)
- Manifest
- Rate Confirmation
- Invoice
- Customs/Hazmat documents
- Load Securement photos
- Other logistics documents

If the document type you identified does NOT match the expected document type (${docType}), this is a CRITICAL ERROR. For example:
- If this is labeled as a BOL but is actually an Invoice, mark it as invalid
- If this is labeled as a POD but is actually a Rate Confirmation, mark it as invalid
- If this is labeled as a Manifest but is actually an Invoice, mark it as invalid
- If this is labeled as any logistics document but is actually an Invoice, mark it as invalid (Invoices are NOT appropriate for order/trip documents)

IMPORTANT: Invoices are financial documents and should NOT be used as order or trip documents. If you detect an Invoice, mark documentTypeMatch as false.

Return a JSON object with this structure:
{
  "valid": boolean,
  "reason": string (if not valid, explain why - especially if document type mismatch),
  "actualDocumentType": string (the actual document type you identified from content, e.g., "Invoice", "BOL", "POD", "Manifest", etc.),
  "expectedDocumentType": string (the expected type: "${docType}"),
  "documentTypeMatch": boolean (true if actual type matches expected type),
  "issues": array of strings (list of specific issues found, including type mismatches),
  "warnings": array of strings (non-critical issues),
  "expirationDate": string | null (YYYY-MM-DD format if found),
  "extractedInfo": {
    "documentNumber": string | null,
    "issueDate": string | null,
    "expiryDate": string | null,
    "keyDetails": object | null
  }
}`;

  return prompt;
};

/**
 * Validate a single document file
 * @param {string} filePath - Path to the document file
 * @param {string} docType - Type of document (bol, pod, manifest, etc.)
 * @param {string} context - 'order' or 'trip'
 * @param {object} metadata - Additional metadata for validation
 * @returns {Promise<object>} Validation result
 */
export const validateSingleDocument = async (filePath, docType, context = 'order', metadata = {}) => {
  try {
    if (!fs.existsSync(filePath)) {
      return {
        success: false,
        valid: false,
        error: 'File not found'
      };
    }

    const fileName = filePath.split(/[/\\]/).pop();
    const documents = [{
      path: filePath,
      originalname: fileName,
      type: docType
    }];

    const result = await validateDocuments(documents, context, metadata);
    
    if (result.documentDetails && result.documentDetails.length > 0) {
      return {
        success: result.success,
        valid: result.valid,
        document: result.documentDetails[0],
        errors: result.errors,
        warnings: result.warnings
      };
    }

    return result;
  } catch (error) {
    console.error('Error in validateSingleDocument:', error);
    return {
      success: false,
      valid: false,
      error: error.message || 'Validation failed'
    };
  }
};

