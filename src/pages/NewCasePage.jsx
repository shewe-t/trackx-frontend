import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Upload, Info, CheckCircle, AlertCircle, FileText, Shield, AlertTriangle } from "lucide-react";
import Papa from "papaparse";
import adflogo from "../assets/image-removebg-preview.png";
import axios from "axios";
import { auth } from "../firebase";
import { signOut } from "firebase/auth";
import { useAuth } from "../context/AuthContext";

// Dynamic PDF.js import to ensure version compatibility
let pdfjsLib = null;

// Security configuration
const SECURITY_CONFIG = {
  maxFileSize: 10 * 1024 * 1024, // 10MB
  allowedMimeTypes: [
    'text/csv',
    'text/plain',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf'
  ],
  allowedExtensions: ['.csv', '.xls', '.xlsx', '.pdf'],
  maliciousPatterns: [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /javascript:/gi,
    /vbscript:/gi,
    /onload\s*=/gi,
    /onerror\s*=/gi,
    /eval\s*\(/gi,
    /document\.write/gi,
    /innerHTML/gi,
    /<\?php/gi,
    /<%/gi,
    /<asp:/gi,
    /cmd\.exe/gi,
    /powershell/gi,
    /system\(/gi,
    /exec\(/gi
  ]
};

// Security Scanner Class
class FileSecurityScanner {
  constructor() {
    this.config = SECURITY_CONFIG;
  }

  // Main security scan function
  async scanFile(file) {
    const results = {
      safe: true,
      threats: [],
      warnings: [],
      fileHash: null,
      scanResults: {}
    };

    try {
      // File size check
      if (file.size > this.config.maxFileSize) {
        results.safe = false;
        results.threats.push(`File size ${this.formatFileSize(file.size)} exceeds limit of ${this.formatFileSize(this.config.maxFileSize)}`);
      }

      // File extension check
      const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
      if (!this.config.allowedExtensions.includes(fileExtension)) {
        results.safe = false;
        results.threats.push(`File extension '${fileExtension}' is not allowed`);
      }

      // MIME type check (basic - browser-provided)
      if (!this.config.allowedMimeTypes.includes(file.type)) {
        results.warnings.push(`MIME type '${file.type}' may not be supported`);
      }

      // Generate file hash for tracking
      results.fileHash = await this.generateFileHash(file);

      // Content-based scanning
      const contentScan = await this.scanFileContent(file);
      results.scanResults.contentScan = contentScan;
      
      if (!contentScan.safe) {
        results.safe = false;
        results.threats.push(...contentScan.threats);
      }

      // Additional checks for specific file types
      if (fileExtension === '.pdf') {
        const pdfScan = await this.scanPDFStructure(file);
        results.scanResults.pdfScan = pdfScan;
        if (!pdfScan.safe) {
          results.safe = false;
          results.threats.push(...pdfScan.threats);
        }
      }

      // Final risk assessment
      results.riskLevel = this.assessRiskLevel(results);

    } catch (error) {
      results.safe = false;
      results.threats.push(`Security scan failed: ${error.message}`);
    }

    return results;
  }

  // Generate SHA-256 hash of file
  async generateFileHash(file) {
    try {
      const buffer = await file.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (error) {
      console.warn('Could not generate file hash:', error);
      return null;
    }
  }

  // Scan file content for malicious patterns
  async scanFileContent(file) {
    const results = {
      safe: true,
      threats: [],
      patternsFound: []
    };

    try {
      // Read file content as text (will work for CSV, PDF metadata, etc.)
      const fileContent = await this.readFileAsText(file);
      
      // Check for null bytes (indicates binary content in text files)
      if (file.type.startsWith('text/') && fileContent.includes('\x00')) {
        results.safe = false;
        results.threats.push('File contains binary data but has text MIME type');
      }

      // Scan for malicious patterns
      for (const pattern of this.config.maliciousPatterns) {
        if (pattern.test(fileContent)) {
          results.safe = false;
          const patternStr = pattern.toString().slice(1, -3); // Remove regex delimiters
          results.threats.push(`Potentially malicious pattern detected: ${patternStr}`);
          results.patternsFound.push(patternStr);
        }
      }

      // Check for suspicious file structure
      if (fileContent.length > 0) {
        // Look for embedded executables
        if (fileContent.includes('MZ') || fileContent.includes('PK')) {
          results.threats.push('File may contain embedded executable content');
          results.safe = false;
        }

        // Check for unusual encoding
        const suspiciousEncoding = /\\x[0-9a-fA-F]{2}|\\u[0-9a-fA-F]{4}|%[0-9a-fA-F]{2}/g;
        if (suspiciousEncoding.test(fileContent)) {
          results.threats.push('File contains suspicious encoded content');
          results.safe = false;
        }
      }

    } catch (error) {
      console.warn('Content scan error:', error);
      // Don't fail security check just because we couldn't read content
    }

    return results;
  }

  // PDF-specific security checks
  async scanPDFStructure(file) {
    const results = {
      safe: true,
      threats: [],
      metadata: {}
    };

    try {
      const buffer = await file.arrayBuffer();
      const content = new TextDecoder().decode(buffer);

      // Check PDF header
      if (!content.startsWith('%PDF-')) {
        results.safe = false;
        results.threats.push('Invalid PDF header - file may be corrupted or malicious');
      }

      // Look for suspicious PDF features
      const suspiciousFeatures = [
        '/JavaScript',
        '/JS',
        '/Launch',
        '/SubmitForm',
        '/ImportData',
        '/ExportData',
        '/Movie',
        '/Sound',
        '/EmbeddedFile'
      ];

      for (const feature of suspiciousFeatures) {
        if (content.includes(feature)) {
          results.threats.push(`PDF contains potentially dangerous feature: ${feature}`);
          results.safe = false;
        }
      }

      // Check for encrypted PDFs
      if (content.includes('/Encrypt')) {
        results.threats.push('PDF is encrypted/password protected');
        results.safe = false;
      }

    } catch (error) {
      console.warn('PDF structure scan error:', error);
    }

    return results;
  }

  // Helper method to read file as text
  async readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file.slice(0, 50000)); // Read first 50KB for pattern detection
    });
  }

  // Assess overall risk level
  assessRiskLevel(results) {
    if (!results.safe) return 'HIGH';
    if (results.warnings.length > 0) return 'MEDIUM';
    return 'LOW';
  }

  // Format file size
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

// Initialize PDF.js
const initPDFJS = async () => {
  if (!pdfjsLib) {
    try {
      const workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
      
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js';
      script.onload = () => {
        if (window.pdfjsLib) {
          pdfjsLib = window.pdfjsLib;
          pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
        }
      };
      document.head.appendChild(script);
      
      await new Promise((resolve) => {
        const checkLoaded = () => {
          if (window.pdfjsLib) {
            pdfjsLib = window.pdfjsLib;
            pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
            resolve();
          } else {
            setTimeout(checkLoaded, 100);
          }
        };
        checkLoaded();
      });
    } catch (error) {
      console.error('Failed to load PDF.js:', error);
      throw new Error('PDF processing library failed to load');
    }
  }
  return pdfjsLib;
};

function NewCasePage() {
  const navigate = useNavigate();
  const [caseNumber, setCaseNumber] = useState("");
  const [caseTitle, setCaseTitle] = useState("");
  const [dateOfIncident, setDateOfIncident] = useState("");
  const [region, setRegion] = useState("");
  const [between, setBetween] = useState("");
  const [file, setFile] = useState(null);
  const [parsedData, setParsedData] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [parseError, setParseError] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [csvStats, setCsvStats] = useState(null);
  const [showGuide, setShowGuide] = useState(false);
  const [fileType, setFileType] = useState(null);
  
  // Security state
  const [isScanning, setIsScanning] = useState(false);
  const [securityResults, setSecurityResults] = useState(null);
  const [showSecurityDetails, setShowSecurityDetails] = useState(false);

  // Initialize security scanner
  const securityScanner = new FileSecurityScanner();

  /**
   * Enhanced file handling with security scanning
   */
  const handleFile = async (selectedFile) => {
    // Reset states
    setFile(null);
    setFileType(null);
    setParsedData(null);
    setCsvStats(null);
    setParseError(null);
    setSecurityResults(null);
    setIsScanning(true);

    try {
      // Perform security scan first
      console.log('🔒 Starting security scan for:', selectedFile.name);
      const scanResults = await securityScanner.scanFile(selectedFile);
      setSecurityResults(scanResults);

      console.log('🔒 Security scan results:', scanResults);

      // Check if file passed security scan
      if (!scanResults.safe) {
        setIsScanning(false);
        setParseError(`🚫 File rejected for security reasons:\n\n${scanResults.threats.join('\n')}\n\nPlease upload a different file.`);
        return;
      }

      // Show warnings if any
      if (scanResults.warnings.length > 0) {
        console.warn('⚠️ Security warnings:', scanResults.warnings);
      }

      // File passed security scan - proceed with processing
      const fileName = selectedFile.name.toLowerCase();
      
      if (selectedFile.type === "text/csv" || fileName.endsWith('.csv')) {
        setFile(selectedFile);
        setFileType('csv');
        setIsScanning(false);
        parseCSV(selectedFile);
      } else if (selectedFile.type === "application/pdf" || fileName.endsWith('.pdf')) {
        setFile(selectedFile);
        setFileType('pdf');
        setIsScanning(false);
        parsePDF(selectedFile);
      } else {
        setIsScanning(false);
        setParseError("🚫 Please upload a CSV or PDF file. Other file types are not supported.");
      }

    } catch (error) {
      setIsScanning(false);
      setParseError(`🚫 Security scan failed: ${error.message}`);
      console.error('Security scan error:', error);
    }
  };

  /**
   * Converts time to ISO timestamp using dateOfIncident
   */
  function convertToISO(description) {
    if (!description || !dateOfIncident) return null;

    const timeMatch = description.match(/\b\d{2}:\d{2}:\d{2}\b/);
    if (!timeMatch) return null;

    const timePart = timeMatch[0];
    const isoString = `${dateOfIncident}T${timePart}Z`;

    const date = new Date(isoString);
    return isNaN(date.getTime()) ? null : date.toISOString();
  }

  /**
   * Enhanced GPS coordinate extraction supporting multiple formats from tracking companies
   */
  const extractGPSCoordinates = (text) => {
    const coordinates = [];
    const lines = text.split('\n');
    
    // Pattern 1: Standard decimal degrees with various separators
    const decimalPattern = /(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)/g;
    
    // Pattern 2: Labeled coordinates 
    const labeledPattern = /(?:lat|latitude)[:\s]*(-?\d+\.\d+)[\s\w]*(?:lon|lng|longitude)[:\s]*(-?\d+\.\d+)/gi;
    
    // Pattern 3: DMS (Degrees Minutes Seconds) format
    const dmsPattern = /(\d+)°(\d+)'([\d.]+)"([NSEW])\s+(\d+)°(\d+)'([\d.]+)"([NSEW])/g;
    
    // Pattern 4: Coordinates: prefix format
    const coordPattern = /(?:coordinates?|gps)[:\s]*(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)/gi;
    
    // Pattern 5: Tabular format (Time Latitude Longitude Status)
    const processStructuredData = (text) => {
      const coords = [];
      const lines = text.split('\n');
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        const timeCoordPattern = /(\d{2}:\d{2}(?::\d{2})?)\s+(-?\d+\.\d+)\s+(-?\d+\.\d+)\s+(stopped|idle|moving)/gi;
        const match = timeCoordPattern.exec(line);
        
        if (match) {
          const [, time, lat, lng, status] = match;
          coords.push({
            lat: parseFloat(lat),
            lng: parseFloat(lng),
            time: time,
            status: status,
            source: 'structured_table'
          });
        }
        
        if (line.toLowerCase().includes('latitude') || line.toLowerCase().includes('lat:')) {
          const latMatch = line.match(/(-?\d+\.\d+)/);
          if (latMatch && i + 1 < lines.length) {
            const nextLine = lines[i + 1];
            const lngMatch = nextLine.match(/(-?\d+\.\d+)/);
            if (lngMatch) {
              coords.push({
                lat: parseFloat(latMatch[1]),
                lng: parseFloat(lngMatch[1]),
                source: 'multi_line'
              });
            }
          }
        }
      }
      return coords;
    };
    
    // Apply all patterns
    let match;
    
    // Pattern 1: Standard decimal degrees
    while ((match = decimalPattern.exec(text)) !== null) {
      const lat = parseFloat(match[1]);
      const lng = parseFloat(match[2]);
      if (isValidCoordinate(lat, lng)) {
        coordinates.push({ 
          lat, 
          lng, 
          source: 'decimal_standard',
          originalText: match[0]
        });
      }
    }
    
    // Pattern 2: Labeled coordinates
    while ((match = labeledPattern.exec(text)) !== null) {
      const lat = parseFloat(match[1]);
      const lng = parseFloat(match[2]);
      if (isValidCoordinate(lat, lng)) {
        coordinates.push({ 
          lat, 
          lng, 
          source: 'labeled',
          originalText: match[0]
        });
      }
    }
    
    // Pattern 3: DMS format
    while ((match = dmsPattern.exec(text)) !== null) {
      try {
        let lat = parseInt(match[1]) + parseInt(match[2])/60 + parseFloat(match[3])/3600;
        let lng = parseInt(match[5]) + parseInt(match[6])/60 + parseFloat(match[7])/3600;
        
        if (match[4] === 'S') lat = -lat;
        if (match[8] === 'W') lng = -lng;
        
        if (isValidCoordinate(lat, lng)) {
          coordinates.push({ 
            lat, 
            lng, 
            source: 'dms',
            originalText: match[0]
          });
        }
      } catch (error) {
        console.log('DMS parsing error:', error);
      }
    }
    
    // Pattern 4: Coordinates prefix
    while ((match = coordPattern.exec(text)) !== null) {
      const lat = parseFloat(match[1]);
      const lng = parseFloat(match[2]);
      if (isValidCoordinate(lat, lng)) {
        coordinates.push({ 
          lat, 
          lng, 
          source: 'coord_prefix',
          originalText: match[0]
        });
      }
    }
    
    // Pattern 5: Structured data
    const structuredCoords = processStructuredData(text);
    coordinates.push(...structuredCoords);
    
    // Remove duplicates (within 0.001 degrees)
    const unique = [];
    coordinates.forEach(coord => {
      const isDuplicate = unique.some(existing => 
        Math.abs(existing.lat - coord.lat) < 0.001 && 
        Math.abs(existing.lng - coord.lng) < 0.001
      );
      if (!isDuplicate) {
        unique.push(coord);
      }
    });
    
    return unique;
  };
  
  /**
   * Validate if coordinates are within reasonable bounds
   */
  const isValidCoordinate = (lat, lng) => {
    return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 && 
           lat !== 0 && lng !== 0;
  };

  /**
   * Enhanced timestamp extraction supporting multiple formats
   */
  const extractTimestamps = (text) => {
    const timestamps = [];
    const patterns = [
      /\b\d{4}[/-]\d{2}[/-]\d{2}[,\s]+\d{2}:\d{2}:\d{2}\b/g,
      /\b\d{2}[/-]\d{2}[/-]\d{4}[,\s]+\d{2}:\d{2}:\d{2}\b/g,
      /\b\d{2}:\d{2}:\d{2}\b/g,
      /\b\d{2}:\d{2}\b/g,
      /Time[:\s]+(\d{2}:\d{2}(?::\d{2})?)/gi,
      /\b\d{4}\/\d{2}\/\d{2}\b/g
    ];
    
    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        timestamps.push(match[0]);
      }
    });
    
    return [...new Set(timestamps)];
  };

  /**
   * Enhanced vehicle status extraction with more comprehensive keywords
   */
  const extractVehicleStatus = (text, context = '') => {
    const combinedText = (text + ' ' + context).toLowerCase();
    
    const statusKeywords = {
      stopped: [
        'stopped', 'parked', 'stationary', 'ignition off', 'engine off', 
        'halt', 'standstill', 'not moving', 'vehicle stopped', 'engine switched off',
        'no movement detected', 'vehicle parked', 'final destination', 'end of tracking'
      ],
      idle: [
        'idling', 'idle', 'engine on', 'ignition on', 'running', 'waiting',
        'engine running', 'temporary stop', 'brief stop', 'passenger drop-off',
        'vehicle idling', 'engine running briefly'
      ],
      moving: [
        'moving', 'motion', 'driving', 'traveling', 'travelling', 'speed', 
        'en route', 'in transit', 'vehicle in motion', 'coordinate recorded during movement',
        'significant movement', 'movement detected'
      ]
    };
    
    for (const [status, keywords] of Object.entries(statusKeywords)) {
      if (keywords.some(keyword => combinedText.includes(keyword))) {
        return status.charAt(0).toUpperCase() + status.slice(1);
      }
    }
    
    if (combinedText.includes('airport') && combinedText.includes('departure')) return 'Idle';
    if (combinedText.includes('mall') || combinedText.includes('shopping')) return 'Stopped';
    if (combinedText.includes('checkpoint') || combinedText.includes('inspection')) return 'Stopped';
    
    return 'Unknown';
  };

  /**
   * Parse PDF file and extract GPS data with enhanced format support
   */
  const parsePDF = async (file) => {
    setIsProcessing(true);
    setParseError(null);
    
    try {
      const pdfjs = await initPDFJS();
      if (!pdfjs) {
        throw new Error('PDF processing library not available');
      }
      
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      
      let fullText = '';
      let pageTexts = [];
      
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        pageTexts.push(pageText);
        fullText += pageText + '\n';
      }
      
      console.log('Extracted PDF text from', pdf.numPages, 'pages');
      console.log('Sample text:', fullText.substring(0, 500));
      
      const coordinates = extractGPSCoordinates(fullText);
      console.log('Extracted coordinates:', coordinates);
      
      if (coordinates.length === 0) {
        let allCoords = [];
        pageTexts.forEach((pageText, index) => {
          const pageCoords = extractGPSCoordinates(pageText);
          allCoords.push(...pageCoords);
        });
        
        if (allCoords.length === 0) {
          setParseError(`No GPS coordinates found in the PDF. 
          
Detected text sample: "${fullText.substring(0, 200)}..."

The PDF may contain:
• Scanned images instead of text
• Coordinates in an unsupported format
• No GPS coordinate data

Please ensure your PDF contains GPS coordinates in one of these formats:
• Decimal: -33.918861, 18.423300
• Labeled: Latitude: -33.918861, Longitude: 18.423300
• DMS: 33°55'07.9"S 18°25'23.9"E`);
          setParsedData(null);
          setCsvStats(null);
          setIsProcessing(false);
          return;
        }
        coordinates.push(...allCoords);
      }
      
      const timestamps = extractTimestamps(fullText);
      console.log('Extracted timestamps:', timestamps);
      
      const processedData = coordinates.map((coord, index) => {
        const coordText = coord.originalText || '';
        const coordIndex = fullText.indexOf(coordText);
        const contextStart = Math.max(0, coordIndex - 100);
        const contextEnd = Math.min(fullText.length, coordIndex + 200);
        const context = fullText.substring(contextStart, contextEnd);
        
        const timestamp = timestamps[index] || coord.time || `Point ${index + 1}`;
        const description = coord.source === 'structured_table' ? 
          `GPS Point ${index + 1} (from table)` : 
          `GPS Point ${index + 1} (${coord.source})`;
        
        let ignitionStatus = coord.status || extractVehicleStatus(context, coordText);
        
        const locationMatch = context.match(/(?:at|near|location|stop)\s+([A-Z][A-Za-z\s]{3,30})/i);
        const locationName = locationMatch ? locationMatch[1] : null;
        
        return {
          id: index,
          lat: coord.lat,
          lng: coord.lng,
          timestamp,
          description: locationName ? `${description} - ${locationName}` : description,
          ignitionStatus,
          rawData: { 
            source: coord.source,
            originalText: coordText,
            context: context,
            pageText: fullText.substring(0, 200) + '...'
          }
        };
      });
      
      console.log('Processed data:', processedData);
      
      const stoppedPoints = processedData.filter(point => {
        const status = String(point.ignitionStatus).toLowerCase();
        return status === "stopped" || 
               status === "idle" || 
               status === "unknown" ||
               point.rawData.source === 'structured_table';
      });
      
      const finalStoppedPoints = stoppedPoints.length > 0 ? stoppedPoints : processedData;
      
      const uniquePoints = [];
      finalStoppedPoints.forEach(point => {
        const isDuplicate = uniquePoints.some(existing => {
          const distance = Math.sqrt(
            Math.pow((existing.lat - point.lat) * 111000, 2) + 
            Math.pow((existing.lng - point.lng) * 111000 * Math.cos(point.lat * Math.PI / 180), 2)
          );
          return distance < 100;
        });
        
        if (!isDuplicate) {
          uniquePoints.push(point);
        }
      });
      
      setParsedData({
        raw: processedData,
        stoppedPoints: uniquePoints
      });
      
      setCsvStats({
        totalPoints: processedData.length,
        stoppedPoints: uniquePoints.length,
        columnsUsed: { source: 'PDF extraction', formats: [...new Set(coordinates.map(c => c.source))] },
        derivedStatus: true,
        pdfInfo: {
          pages: pdf.numPages,
          coordinateFormats: [...new Set(coordinates.map(c => c.source))],
          timestampsFound: timestamps.length
        }
      });
      
    } catch (error) {
      console.error("Error parsing PDF:", error);
      let errorMessage = `Error parsing PDF: ${error.message}`;
      
      if (error.message.includes('PDF processing library')) {
        errorMessage = `PDF processing library failed to load. Please check your internet connection and try again.`;
      } else if (error.message.includes('Invalid PDF')) {
        errorMessage = `Invalid PDF file. Please ensure the file is not corrupted.`;
      } else if (error.message.includes('password')) {
        errorMessage = `Password-protected PDFs are not supported. Please provide an unprotected PDF.`;
      }
      
      setParseError(errorMessage);
      setParsedData(null);
      setCsvStats(null);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCreateCase = async () => {
    try {
      if (!caseNumber || !caseTitle || !dateOfIncident || !region || !parsedData) {
        alert("Please fill all required fields and upload a valid file");
        return;
      }

      setIsProcessing(true);

      const casePayload = {
        case_number: caseNumber,
        case_title: caseTitle,
        date_of_incident: dateOfIncident,
        region: region,
        between: between || "",
        csv_data: parsedData.stoppedPoints.map(point => ({
          latitude: point.lat,
          longitude: point.lng,
          timestamp: point.timestamp || null,
          description: point.description || null,
          ignitionStatus: point.ignitionStatus || false
        })),
        all_points: parsedData.raw.map(point => ({
          latitude: point.lat,
          longitude: point.lng,
          timestamp: convertToISO(point.description),
          description: point.description || null
        }))
      };

      const response = await axios.post("http://localhost:8000/cases/create", casePayload, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.data) {
        const firestoreDocId = response.data.case_id || response.data.id || response.data.doc_id;
        console.log("✅ Created case Firestore ID:", firestoreDocId);

        const caseData = {
          caseId: response.data.caseId,
          caseNumber,
          caseTitle,
          dateOfIncident,
          region,
          between,
          locations: parsedData.stoppedPoints
        };

        localStorage.setItem('trackxCaseData', JSON.stringify(caseData));

        alert("Case created and moving to next step!");
        navigate("/annotations");
      }

    } catch (error) {
      console.error("Failed to create case:", error);
      if (error.response) {
        alert(`Failed to create case: ${JSON.stringify(error.response.data.detail)}`);
      } else if (error.request) {
        alert("Failed to create case: No response from server. Check your network connection.");
      } else {
        alert(`Failed to create case: ${error.message}`);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const { profile } = useAuth();

  const determineIgnitionStatus = (description) => {
    if (!description) return null;
    
    const desc = description.toLowerCase();
    
    if (
      desc.includes('stopped') || 
      desc.includes('parked') || 
      desc.includes('stationary') ||
      desc.includes('ignition off') ||
      desc.includes('engine off') ||
      desc.includes('not moving') ||
      desc.includes('halt') ||
      desc.includes('standstill')
    ) {
      return 'Stopped';
    }
    
    if (
      desc.includes('idling') || 
      desc.includes('idle') || 
      desc.includes('engine on') ||
      desc.includes('ignition on') ||
      desc.includes('running') ||
      desc.includes('waiting')
    ) {
      return 'Idle';
    }
    
    if (
      desc.includes('moving') || 
      desc.includes('motion') || 
      desc.includes('driving') ||
      desc.includes('traveling') || 
      desc.includes('travelling') ||
      desc.includes('en route') ||
      desc.includes('in transit') ||
      desc.includes('speed')
    ) {
      return 'Moving';
    }
    
    return null;
  };

  // Handle drag events
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  // Original CSV parsing function (unchanged)
  const parseCSV = (file) => {
    setIsProcessing(true);
    setParseError(null);
    
    Papa.parse(file, {
      header: true, 
      dynamicTyping: true, 
      skipEmptyLines: true, 
      complete: function(results) {
        setIsProcessing(false);
        
        if (results.errors.length > 0) {
          console.error("CSV parsing errors:", results.errors);
          setParseError(`Error parsing CSV: ${results.errors[0].message}. Check console for details.`);
          setParsedData(null);
          setCsvStats(null);
          return;
        }
        
        try {
          if (!results.data || results.data.length === 0) {
            setParseError("CSV file appears to be empty");
            setParsedData(null);
            setCsvStats(null);
            return;
          }
          
          const firstRow = results.data[0];
          const columns = Object.keys(firstRow);
          
          const possibleColumns = {
            lat: columns.filter(col => 
              col.toLowerCase().includes('lat') || 
              col.toLowerCase().includes('latitude')
            ),
            lng: columns.filter(col => 
              col.toLowerCase().includes('lon') || 
              col.toLowerCase().includes('lng') ||
              col.toLowerCase().includes('long')
            ),
            timestamp: columns.filter(col => 
              col.toLowerCase().includes('time') || 
              col.toLowerCase().includes('date') ||
              col.toLowerCase().includes('stamp')
            ),
            description: columns.filter(col => 
              col.toLowerCase().includes('desc') || 
              col.toLowerCase().includes('note') ||
              col.toLowerCase().includes('comment') ||
              col.toLowerCase().includes('text')
            ),
            ignition: columns.filter(col => 
              col.toLowerCase().includes('ignition') || 
              col.toLowerCase().includes('status') ||
              col.toLowerCase().includes('engine')
            )
          };
          
          if (possibleColumns.lat.length === 0 || possibleColumns.lng.length === 0) {
            setParseError("Could not identify latitude/longitude columns in the CSV");
            setParsedData(null);
            setCsvStats(null);
            return;
          }
          
          const bestColumns = {
            lat: possibleColumns.lat[0],
            lng: possibleColumns.lng[0],
            timestamp: possibleColumns.timestamp.length > 0 ? possibleColumns.timestamp[0] : null,
            description: possibleColumns.description.length > 0 ? possibleColumns.description[0] : null,
            ignition: possibleColumns.ignition.length > 0 ? possibleColumns.ignition[0] : null
          };
          
          const processedData = results.data.map((row, index) => {
            const lat = parseFloat(row[bestColumns.lat]);
            const lng = parseFloat(row[bestColumns.lng]);
            const description = bestColumns.description ? row[bestColumns.description] : null;
            let ignitionStatus = bestColumns.ignition ? row[bestColumns.ignition] : null;
            
            if ((!ignitionStatus || ignitionStatus === '') && description) {
              ignitionStatus = determineIgnitionStatus(description);
            }
            
            const timestamp = bestColumns.timestamp ? row[bestColumns.timestamp] : `Record ${index + 1}`;
            
            return {
              id: index,
              lat,
              lng,
              timestamp,
              description,
              ignitionStatus,
              rawData: row 
            };
          }).filter(item => {
            return !isNaN(item.lat) && !isNaN(item.lng);
          });
          
          if (processedData.length === 0) {
            setParseError("No valid GPS coordinates found in the CSV");
            setParsedData(null);
            setCsvStats(null);
            return;
          }
          
          const stoppedPoints = processedData.filter(point => {
            if (!point.ignitionStatus) return false;
            
            const status = String(point.ignitionStatus).toLowerCase();
            return status === "stopped" || 
                   status === "off" || 
                   status === "idle";
          });
          
          if (stoppedPoints.length === 0) {
            setParseError("No stopped or idle vehicle points found in the CSV.");
            setParsedData(null);
            setCsvStats({
              totalPoints: processedData.length,
              stoppedPoints: 0,
              columnsUsed: bestColumns
            });
            return;
          }
          
          setParsedData({
            raw: processedData,
            stoppedPoints: stoppedPoints
          });
          
          setCsvStats({
            totalPoints: processedData.length,
            stoppedPoints: stoppedPoints.length,
            columnsUsed: bestColumns,
            derivedStatus: !bestColumns.ignition || 
                           processedData.some(p => !p.ignitionStatus && determineIgnitionStatus(p.description))
          });
          
        } catch (error) {
          console.error("Error processing CSV data:", error);
          setParseError(`Error processing CSV data: ${error.message}`);
          setParsedData(null);
          setCsvStats(null);
        }
      },
      error: function(error) {
        console.error("Error reading CSV file:", error);
        setIsProcessing(false);
        setParseError(`Error reading CSV file: ${error.message}`);
        setParsedData(null);
        setCsvStats(null);
      }
    });
  };

  const handleNext = async (e) => {
    e.preventDefault();
    
    if (!caseNumber || !caseTitle || !dateOfIncident || !region || !file || !parsedData) {
      alert("Please fill all required fields and upload a valid file");
      return;
    }

    await handleCreateCase();
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      navigate("/");
    } catch (error) {
      console.error("Sign-out failed:", error.message);
    }
  };

  // Security status component
  const SecurityStatus = () => {
    if (!securityResults) return null;

    const getRiskColor = (level) => {
      switch (level) {
        case 'LOW': return 'text-green-400';
        case 'MEDIUM': return 'text-yellow-400';
        case 'HIGH': return 'text-red-400';
        default: return 'text-gray-400';
      }
    };

    const getRiskIcon = (level) => {
      switch (level) {
        case 'LOW': return <Shield className="w-4 h-4" />;
        case 'MEDIUM': return <AlertTriangle className="w-4 h-4" />;
        case 'HIGH': return <AlertCircle className="w-4 h-4" />;
        default: return <Shield className="w-4 h-4" />;
      }
    };

    return (
      <div className="mt-2 p-3 bg-gray-800 rounded border border-gray-600">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className={getRiskColor(securityResults.riskLevel)}>
              {getRiskIcon(securityResults.riskLevel)}
            </div>
            <span className={`font-semibold ${getRiskColor(securityResults.riskLevel)}`}>
              Security: {securityResults.riskLevel} Risk
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowSecurityDetails(!showSecurityDetails)}
            className="text-blue-400 hover:text-blue-300 text-sm"
          >
            {showSecurityDetails ? 'Hide Details' : 'Show Details'}
          </button>
        </div>
        
        {showSecurityDetails && (
          <div className="mt-3 space-y-2 text-sm">
            {securityResults.fileHash && (
              <p className="text-gray-400">
                File Hash: <span className="font-mono text-xs">{securityResults.fileHash.substring(0, 16)}...</span>
              </p>
            )}
            
            {securityResults.threats.length > 0 && (
              <div>
                <p className="text-red-400 font-semibold">Threats Detected:</p>
                <ul className="list-disc list-inside text-red-300 text-xs ml-2">
                  {securityResults.threats.map((threat, index) => (
                    <li key={index}>{threat}</li>
                  ))}
                </ul>
              </div>
            )}
            
            {securityResults.warnings.length > 0 && (
              <div>
                <p className="text-yellow-400 font-semibold">Warnings:</p>
                <ul className="list-disc list-inside text-yellow-300 text-xs ml-2">
                  {securityResults.warnings.map((warning, index) => (
                    <li key={index}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}
            
            {securityResults.safe && securityResults.threats.length === 0 && (
              <p className="text-green-400 text-xs">✓ File passed all security checks</p>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1 }}
      className="relative min-h-screen text-white font-sans overflow-hidden"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-black via-gray-900 to-black -z-10" />
      
      {/* Navbar */}
      <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-black to-gray-900 shadow-md">
        <Link to="/home">
          <img src={adflogo} alt="Logo" className="h-12 cursor-pointer hover:opacity-80 transition" />
        </Link>

        <h1 className="text-xl font-bold text-white">New Case</h1>

        <div className="flex items-center space-x-4">
          <div className="text-right">
            <p className="text-sm text-white">{profile ? `${profile.firstName} ${profile.surname}` : "Loading..."}</p>
            <button
              onClick={handleSignOut}
              className="text-red-400 hover:text-red-600 text-xs"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>

      {/* Nav Tabs */}
      <div className="flex justify-center space-x-8 bg-gray-800 py-2 text-white text-sm">
        <span className="font-bold underline">Case Information</span>
        <Link to="/annotations" className="text-gray-400 hover:text-white">Annotations</Link>
        <Link to="/overview" className="text-gray-400 hover:text-white">Overview</Link>
      </div>

      {/* Page Content */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        <form onSubmit={handleNext} className="space-y-6">
          {/* Case Details Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="caseNumber" className="block text-sm font-medium text-gray-300 mb-1">
                Case Number *
              </label>
              <input
                type="text"
                id="caseNumber"
                value={caseNumber}
                onChange={(e) => setCaseNumber(e.target.value)}
                className="w-full p-2 bg-gray-800 border border-gray-600 rounded text-white"
                required
              />
            </div>

            <div>
              <label htmlFor="caseTitle" className="block text-sm font-medium text-gray-300 mb-1">
                Case Title *
              </label>
              <input
                type="text"
                id="caseTitle"
                value={caseTitle}
                onChange={(e) => setCaseTitle(e.target.value)}
                className="w-full p-2 bg-gray-800 border border-gray-600 rounded text-white"
                required
              />
            </div>

            <div>
              <label htmlFor="dateOfIncident" className="block text-sm font-medium text-gray-300 mb-1">
                Date of Incident *
              </label>
              <input
                type="date"
                id="dateOfIncident"
                value={dateOfIncident}
                onChange={(e) => setDateOfIncident(e.target.value)}
                className="w-full p-2 bg-gray-800 border border-gray-600 rounded text-white"
                required
              />
            </div>

            <div>
              <label htmlFor="region" className="block text-sm font-medium text-gray-300 mb-1">
                Region *
              </label>
              <select
                id="region"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="w-full p-2 bg-gray-800 border border-gray-600 rounded text-white"
                required
              >
                <option value="">Select a region</option>
                <option value="western-cape">Western Cape</option>
                <option value="eastern-cape">Eastern Cape</option>
                <option value="northern-cape">Northern Cape</option>
                <option value="gauteng">Gauteng</option>
                <option value="kwazulu-natal">KwaZulu-Natal</option>
                <option value="free-state">Free State</option>
                <option value="mpumalanga">Mpumalanga</option>
                <option value="limpopo">Limpopo</option>
                <option value="north-west">North West</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label htmlFor="between" className="block text-sm font-medium text-gray-300 mb-1">
                Between
              </label>
              <input
                type="text"
                id="between"
                value={between}
                onChange={(e) => setBetween(e.target.value)}
                className="w-full p-2 bg-gray-800 border border-gray-600 rounded text-white"
                placeholder="e.g. The State vs. John Doe"
              />
            </div>
          </div>

          {/* Enhanced File Upload Section with Security */}
          <div className="mt-8">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-300">
                Upload GPS Coordinates (CSV or PDF) * 
                <span className="ml-2 text-green-400 text-xs">🔒 Security Enabled</span>
              </label>
              <button 
                type="button"
                onClick={() => setShowGuide(!showGuide)}
                className="text-blue-400 hover:text-blue-300 text-sm flex items-center"
              >
                <Info className="w-4 h-4 mr-1" />
                {showGuide ? "Hide Guide" : "View File Guide"}
              </button>
            </div>

            {/* Enhanced Guide with Security Info */}
            {showGuide && (
              <div className="bg-gray-800 p-4 rounded-lg text-sm text-gray-300 mb-4">
                {/* Security Notice */}
                <div className="mb-4 p-3 bg-green-900 bg-opacity-20 border border-green-700 rounded">
                  <h3 className="font-semibold mb-2 text-green-400 flex items-center">
                    <Shield className="w-4 h-4 mr-2" />
                    Security Protection Active
                  </h3>
                  <p className="text-xs text-green-300 mb-2">
                    All uploaded files are automatically scanned for security threats including:
                  </p>
                  <ul className="list-disc pl-5 space-y-1 text-xs text-green-300">
                    <li>File size and type validation</li>
                    <li>Malicious content detection</li>
                    <li>Suspicious pattern analysis</li>
                    <li>PDF structure verification</li>
                  </ul>
                </div>

                <h3 className="font-semibold mb-2">Supported File Formats:</h3>
                
                {/* CSV Section */}
                <div className="mb-4">
                  <h4 className="font-semibold text-blue-400 mb-1">CSV Files:</h4>
                  <p className="mb-2">Your CSV should include the following columns:</p>
                  <ul className="list-disc pl-5 space-y-1 text-xs">
                    <li>Latitude (decimal coordinates - column name containing "lat" or "latitude")</li>
                    <li>Longitude (decimal coordinates - column name containing "lng", "lon", or "longitude")</li>
                    <li>Description (optional - column name containing "desc", "note", or "comment")</li>
                    <li>Ignition Status (optional - column name containing "ignition" or "status")</li>
                    <li>Timestamp (optional - column name containing "time", "date", or "stamp")</li>
                  </ul>
                </div>

                {/* PDF Section */}
                <div className="mb-4">
                  <h4 className="font-semibold text-green-400 mb-1">PDF Files:</h4>
                  <p className="mb-2">PDF files will be automatically processed to extract:</p>
                  <ul className="list-disc pl-5 space-y-1 text-xs">
                    <li>GPS coordinates in decimal format (e.g., -33.918861, 18.423300)</li>
                    <li>Coordinates with labels (e.g., "Latitude: -33.918861, Longitude: 18.423300")</li>
                    <li>Degrees/Minutes/Seconds format (e.g., 33°55'07.9"S 18°25'23.9"E)</li>
                    <li>Timestamps and vehicle status information when available</li>
                  </ul>
                  <p className="mt-2 text-xs text-yellow-400">
                    Note: PDF extraction works best with text-based PDFs. Scanned images may not extract properly.
                  </p>
                </div>

                {/* File Limits */}
                <div className="mb-4 p-2 bg-gray-700 rounded">
                  <h4 className="font-semibold text-orange-400 mb-1">File Limits:</h4>
                  <ul className="list-disc pl-5 space-y-1 text-xs">
                    <li>Maximum file size: 10MB</li>
                    <li>Supported extensions: .csv, .pdf, .xls, .xlsx</li>
                    <li>Text-based files only (no scanned images)</li>
                  </ul>
                </div>

                {/* Ignition Status Detection */}
                <div className="mt-3 pt-3 border-t border-gray-700">
                  <p className="font-semibold mb-1">Intelligent Vehicle Status Detection:</p>
                  <p className="mb-2 text-xs text-gray-400">
                    The system analyzes text content to determine vehicle status:
                  </p>
                  <div className="grid grid-cols-3 gap-2 text-xs mt-2">
                    <div className="p-2 bg-red-900 bg-opacity-20 rounded">
                      <p className="font-semibold text-red-400 mb-1">Stopped</p>
                      <p className="text-gray-400">stopped, parked, ignition off, engine off, stationary</p>
                    </div>
                    <div className="p-2 bg-yellow-900 bg-opacity-20 rounded">
                      <p className="font-semibold text-yellow-400 mb-1">Idle</p>
                      <p className="text-gray-400">idling, idle, engine on, ignition on, running</p>
                    </div>
                    <div className="p-2 bg-green-900 bg-opacity-20 rounded">
                      <p className="font-semibold text-green-400 mb-1">Moving</p>
                      <p className="text-gray-400">moving, driving, traveling, speed, en route</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            <div
              className={`border-2 border-dashed p-8 rounded-lg flex flex-col items-center justify-center cursor-pointer
               ${isDragging ? 'border-blue-500 bg-blue-900 bg-opacity-20' : 'border-gray-600'} 
               ${file && !parseError ? 'bg-green-900 bg-opacity-20' : ''} 
               ${parseError ? 'bg-red-900 bg-opacity-20' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => document.getElementById('file-upload').click()}
            >
              <input
                id="file-upload"
                type="file"
                accept=".csv,.pdf,.xls,.xlsx"
                className="hidden"
                onChange={handleFileSelect}
              />
              
              {isScanning ? (
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
                  <div className="text-blue-400 mb-2">🔒 Scanning file for security threats...</div>
                  <div className="text-xs text-gray-400">
                    Checking file type, size, and content for malicious patterns
                  </div>
                </div>
              ) : isProcessing ? (
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-green-500 mx-auto mb-4"></div>
                  <div className="text-green-400 mb-2">Processing {fileType?.toUpperCase()} file...</div>
                  <div className="text-xs text-gray-400">
                    {fileType === 'pdf' ? 'Extracting text and GPS coordinates from PDF...' : 'Analyzing CSV structure and extracting location data...'}
                  </div>
                </div>
              ) : file && !parseError ? (
                <div className="text-center">
                  <CheckCircle className="h-8 w-8 text-green-400 mx-auto mb-2" />
                  <div className="text-green-400 mb-2">
                    {fileType === 'pdf' ? 'PDF processed successfully' : 'CSV processed successfully'}
                  </div>
                  <p className="text-gray-300 flex items-center justify-center">
                    {fileType === 'pdf' ? <FileText className="w-4 h-4 mr-2" /> : null}
                    {file.name}
                  </p>
                  {csvStats && (
                    <div className="text-gray-400 mt-3 text-sm">
                      <p>Total data points: {csvStats.totalPoints}</p>
                      <p>Stopped/Relevant locations: {csvStats.stoppedPoints}</p>
                      {csvStats.columnsUsed && csvStats.columnsUsed.source !== 'PDF extraction' && (
                        <div className="mt-2 text-xs">
                          <p>Using columns:</p>
                          <p>Latitude: {csvStats.columnsUsed.lat}</p>
                          <p>Longitude: {csvStats.columnsUsed.lng}</p>
                          {csvStats.columnsUsed.ignition && (
                            <p>Ignition Status: {csvStats.columnsUsed.ignition}</p>
                          )}
                          {csvStats.columnsUsed.description && (
                            <p>Description: {csvStats.columnsUsed.description}</p>
                          )}
                          {csvStats.columnsUsed.timestamp && (
                            <p>Timestamp: {csvStats.columnsUsed.timestamp}</p>
                          )}
                        </div>
                      )}
                      {fileType === 'pdf' && csvStats.pdfInfo && (
                        <div className="mt-2 text-xs">
                          <p className="text-green-400">✓ Processed {csvStats.pdfInfo.pages} PDF page(s)</p>
                          <p className="text-green-400">✓ Coordinate formats: {csvStats.pdfInfo.coordinateFormats.join(', ')}</p>
                          {csvStats.pdfInfo.timestampsFound > 0 && (
                            <p className="text-green-400">✓ Found {csvStats.pdfInfo.timestampsFound} timestamps</p>
                          )}
                        </div>
                      )}
                      {fileType === 'csv' && csvStats.derivedStatus && (
                        <p className="mt-1 text-yellow-400">
                          {fileType === 'pdf' ? 'Vehicle status derived from PDF content' : 'Using descriptions to determine vehicle status'}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ) : parseError ? (
                <div className="text-center">
                  <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-2" />
                  <div className="text-red-400 mb-2">Error processing file</div>
                  <p className="text-red-300 max-w-md whitespace-pre-line">{parseError}</p>
                  <p className="text-gray-400 mt-2">Click to try another file</p>
                </div>
              ) : (
                <>
                  <Upload className="h-12 w-12 text-gray-400 mb-4" />
                  <p className="text-gray-300 mb-2">Drag and drop your CSV or PDF file here</p>
                  <p className="text-gray-500 text-sm">or click to browse</p>
                  <div className="flex items-center mt-4 space-x-4 text-xs text-gray-400">
                    <div className="flex items-center">
                      <div className="w-3 h-3 bg-blue-500 rounded mr-2"></div>
                      CSV Files
                    </div>
                    <div className="flex items-center">
                      <FileText className="w-3 h-3 mr-2" />
                      PDF Files
                    </div>
                    <div className="flex items-center">
                      <Shield className="w-3 h-3 mr-2 text-green-400" />
                      Security Protected
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Security Results Display */}
            <SecurityStatus />
          </div>

          {/* Navigation Buttons */}
          <div className="flex justify-between mt-10">
            <Link 
              to="/home" 
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-white"
            >
              Cancel
            </Link>
            <button 
              type="submit" 
              className={`px-4 py-2 rounded text-white ${parsedData && parsedData.stoppedPoints.length > 0 ? 'bg-blue-700 hover:bg-blue-600' : 'bg-blue-900 cursor-not-allowed opacity-50'}`}
              disabled={!parsedData || parsedData.stoppedPoints.length === 0 || isScanning}
            >
              Next
            </button>
          </div>
        </form>
      </div>
    </motion.div>
  );
}

export default NewCasePage;