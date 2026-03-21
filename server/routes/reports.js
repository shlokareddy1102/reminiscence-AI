const router = require('express').Router();
const mongoose = require('mongoose');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const Patient = require('../models/Patient');
const Alert = require('../models/Alert');
const Event = require('../models/Event');
const Report = require('../models/Report');

// Helper to get date range based on report type
const getDateRange = (reportType) => {
  const endDate = new Date();
  const startDate = new Date();

  switch (reportType) {
    case 'weekly':
      startDate.setDate(endDate.getDate() - 7);
      break;
    case 'monthly':
      startDate.setMonth(endDate.getMonth() - 1);
      break;
    case 'yearly':
      startDate.setFullYear(endDate.getFullYear() - 1);
      break;
    default:
      startDate.setDate(endDate.getDate() - 7);
  }

  return { startDate, endDate };
};

// Helper to generate PDF report
const generatePDF = (reportData) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const fileName = `patient_report_${reportData.patientId}_${Date.now()}.pdf`;
    const filePath = path.join(__dirname, '../reports', fileName);

    // Create reports directory if it doesn't exist
    const reportsDir = path.dirname(filePath);
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // Title
    doc.fontSize(24).font('Helvetica-Bold').text('Patient Health Report', { align: 'center' });
    doc.fontSize(10).font('Helvetica').text(`Generated on: ${new Date().toLocaleDateString()}`, { align: 'center' });
    doc.moveDown();

    // Patient Info
    doc.fontSize(14).font('Helvetica-Bold').text('Patient Information', { underline: true });
    doc.fontSize(11).font('Helvetica');
    doc.text(`Name: ${reportData.patientName}`);
    doc.text(`Age: ${reportData.patientAge}`);
    doc.text(`Report Period: ${reportData.reportType.toUpperCase()}`);
    doc.text(`Date Range: ${reportData.startDate.toLocaleDateString()} - ${reportData.endDate.toLocaleDateString()}`);
    doc.moveDown();

    // Summary Metrics
    doc.fontSize(14).font('Helvetica-Bold').text('Summary Metrics', { underline: true });
    doc.fontSize(11).font('Helvetica');
    doc.text(`Total Alerts: ${reportData.totalAlerts}`, { continued: true });
    doc.text(`  |  High Risk Alerts: ${reportData.highRiskAlerts}`);
    doc.text(`Total Events: ${reportData.totalEvents}`);
    doc.text(`Average Risk Score: ${reportData.averageRiskScore.toFixed(2)}/100`);
    doc.moveDown();

    // Risk Assessment
    doc.fontSize(14).font('Helvetica-Bold').text('Risk Assessment', { underline: true });
    doc.fontSize(11).font('Helvetica');
    
    const trendColor = reportData.riskTrend === 'improving' ? 'Improving ✓' : reportData.riskTrend === 'stable' ? 'Stable —' : 'Declining ✗';
    doc.text(`Risk Trend: ${trendColor}`);
    doc.text(`Deterioration Rate: ${reportData.deteriorationRate > 0 ? '+' : ''}${reportData.deteriorationRate.toFixed(1)}%`);
    doc.moveDown();

    // Current State History
    if (reportData.stateChanges && reportData.stateChanges.length > 0) {
      doc.fontSize(14).font('Helvetica-Bold').text('State Changes', { underline: true });
      doc.fontSize(11).font('Helvetica');
      reportData.stateChanges.forEach(change => {
        doc.text(`• ${change}`);
      });
      doc.moveDown();
    }

    // Alert Breakdown
    doc.fontSize(14).font('Helvetica-Bold').text('Alert Breakdown', { underline: true });
    doc.fontSize(11).font('Helvetica');
    doc.text(`Low Risk: ${reportData.alertBreakdown?.low || 0}`);
    doc.text(`Medium Risk: ${reportData.alertBreakdown?.medium || 0}`);
    doc.text(`High Risk: ${reportData.alertBreakdown?.high || 0}`);
    doc.moveDown();

    // Recommendations
    if (reportData.recommendations && reportData.recommendations.length > 0) {
      doc.fontSize(14).font('Helvetica-Bold').text('Clinical Recommendations', { underline: true });
      doc.fontSize(11).font('Helvetica');
      reportData.recommendations.forEach(rec => {
        doc.text(`• ${rec}`, { align: 'left' });
      });
      doc.moveDown();
    }

    // Summary
    if (reportData.summary) {
      doc.fontSize(14).font('Helvetica-Bold').text('Summary', { underline: true });
      doc.fontSize(11).font('Helvetica');
      doc.text(reportData.summary, { align: 'left' });
    }

    doc.end();

    stream.on('finish', () => resolve(filePath));
    stream.on('error', reject);
  });
};

// Generate report and return as download
router.post('/generate', async (req, res) => {
  try {
    const { patientId, reportType } = req.body;
    const userId = req.user?.id || null;

    if (!patientId || !reportType) {
      return res.status(400).json({ message: 'patientId and reportType are required' });
    }

    const { startDate, endDate } = getDateRange(reportType);

    // Fetch patient info
    const patient = await Patient.findById(patientId);
    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    // Fetch alerts and events in date range
    const [alerts, events] = await Promise.all([
      Alert.find({
        patientId,
        timestamp: { $gte: startDate, $lte: endDate }
      }).lean(),
      Event.find({
        patientId,
        timestamp: { $gte: startDate, $lte: endDate }
      }).lean()
    ]);

    // Calculate metrics
    const highRiskAlerts = alerts.filter(a => a.riskLevel === 'HIGH').length;
    const mediumRiskAlerts = alerts.filter(a => a.riskLevel === 'MEDIUM').length;
    const lowRiskAlerts = alerts.filter(a => a.riskLevel === 'LOW').length;
    
    const averageRiskScore = alerts.length > 0
      ? Math.round(alerts.reduce((sum, a) => sum + (a.riskLevel === 'HIGH' ? 80 : a.riskLevel === 'MEDIUM' ? 50 : 20), 0) / alerts.length)
      : 0;

    // Calculate deterioration trend
    const firstHalf = alerts.slice(0, Math.floor(alerts.length / 2)).length;
    const secondHalf = alerts.slice(Math.floor(alerts.length / 2)).length;
    let deteriorationRate = 0;
    let riskTrend = 'stable';
    
    if (firstHalf > 0) {
      deteriorationRate = ((secondHalf - firstHalf) / firstHalf) * 100;
      riskTrend = deteriorationRate > 5 ? 'declining' : deteriorationRate < -5 ? 'improving' : 'stable';
    }

    // Extract state changes
    const stateChanges = events
      .filter(e => e.eventType === 'state_change')
      .map(e => `${e.metadata?.oldState || 'UNKNOWN'} → ${e.metadata?.newState || 'UNKNOWN'} on ${new Date(e.timestamp).toLocaleDateString()}`)
      .slice(-10); // Last 10 state changes

    // Generate recommendations
    const recommendations = [];
    if (highRiskAlerts > 5) {
      recommendations.push('Increase monitoring frequency due to high alert count.');
    }
    if (riskTrend === 'declining') {
      recommendations.push('Consider medication review or intervention plan adjustment.');
    }
    if (events.length === 0) {
      recommendations.push('Ensure monitoring systems are functioning properly.');
    } else {
      recommendations.push('Continue current care plan with regular monitoring.');
    }

    // Create summary
    const summary = `Patient ${patient.name} (Age ${patient.age}) showed a ${riskTrend} trend with ${highRiskAlerts} high-risk alerts and ${alerts.length} total alerts during the ${reportType} reporting period. Average risk score: ${averageRiskScore}/100.`;

    // Generate PDF
    const reportData = {
      patientId,
      patientName: patient.name,
      patientAge: patient.age,
      reportType,
      startDate,
      endDate,
      totalAlerts: alerts.length,
      highRiskAlerts,
      totalEvents: events.length,
      averageRiskScore,
      stateChanges,
      riskTrend,
      deteriorationRate,
      alertBreakdown: { low: lowRiskAlerts, medium: mediumRiskAlerts, high: highRiskAlerts },
      recommendations,
      summary
    };

    const pdfPath = await generatePDF(reportData);

    // Save report record to DB
    const report = await Report.create({
      patientId,
      reportType,
      startDate,
      endDate,
      totalAlerts: alerts.length,
      highRiskAlerts,
      totalEvents: events.length,
      averageRiskScore,
      stateChanges,
      riskTrend,
      deteriorationRate,
      summary,
      recommendations,
      pdfPath,
      createdBy: userId
    });

    // Send file as download
    res.download(pdfPath, `patient_report_${patient.name}_${reportType}.pdf`, (err) => {
      if (err) console.error('Download error:', err);
    });
  } catch (error) {
    console.error('Report generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get report history for a patient
router.get('/history/:patientId', async (req, res) => {
  try {
    const { patientId } = req.params;

    const reports = await Report.find({ patientId })
      .select('reportType startDate endDate generatedAt riskTrend deteriorationRate totalAlerts')
      .sort({ generatedAt: -1 })
      .limit(20)
      .lean();

    res.json(reports);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
