// server.cjs
const express    = require('express');
const cors       = require('cors');
const bodyParser = require('body-parser');
const path       = require('path');
const mongoose   = require('mongoose');
const dotenv     = require('dotenv');
const jwt        = require('jsonwebtoken');
const bcrypt     = require('bcrypt');
const nodemailer = require('nodemailer');
const crypto     = require('crypto');
const axios      = require('axios');
const cron       = require('node-cron')
const cookieParser = require('cookie-parser')
const expressWs  = require('express-ws');
// Load env
dotenv.config();

// Log server configuration
console.log('🔧 Server Configuration:');
console.log(`📡 Port: ${process.env.SERVER_PORT || 5000}`);
console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`🗄️ MongoDB: ${process.env.MONGO_URL ? 'Connected' : 'Not configured'}`);
console.log(`📧 SMTP: ${process.env.SMTP_HOST || 'Not configured'}`);
console.log(`💳 PayPal: ${process.env.PAYPAL_CLIENT_ID ? 'Configured' : 'Not configured'}`);

// Models & middleware
const User            = require('./src/models/User.cjs');
const { authenticate } = require('./src/middleware/auth.cjs');
const portfolioRoutes = require('./src/routes/portfolioRoutes.cjs');
const Invitation      = require('./src/models/Invitation.cjs');
const Member          = require('./src/models/Member.cjs');
const SchemaChange    = require('./src/models/SchemaChange.cjs');
const SchemaOperation = require('./src/models/SchemaOperation.cjs');

// Config
const PORT = Number(process.env.PORT) || 5000;
const MONGO_URL      = process.env.MONGO_URL;
const FRONTEND_ORIGIN= process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
const SMTP_PORT      = Number(process.env.SMTP_PORT);

// Express setup
const app = express();
// server.cjs, app = express() çağırıldıqdan sonra
const wsInstance = expressWs(app);

// WebSocket collaboration storage
const connections = new Map();
const userSessions = new Map();
const schemaData = new Map(); // Store schema data for each workspace

// Broadcast message to all users in a schema except sender
function broadcastToSchema(schemaId, message, excludeUserId = null) {
  const schemaConnections = connections.get(schemaId);
  if (!schemaConnections) return;

  const messageStr = JSON.stringify(message);
  console.log(`📤 Broadcasting to schema ${schemaId}:`, message.type, `(${schemaConnections.size} connections)`);
  
  schemaConnections.forEach(ws => {
    if (ws.readyState === 1 && ws.userId !== excludeUserId) { // 1 = OPEN
      try {
        ws.send(messageStr);
      } catch (error) {
        console.error('Error sending message to client:', error);
        cleanupConnection(ws, schemaId);
      }
    }
  });
}

// Clean up closed connections
function cleanupConnection(ws, schemaId) {
  const schemaConnections = connections.get(schemaId);
  if (schemaConnections) {
    schemaConnections.delete(ws);
    if (schemaConnections.size === 0) {
      connections.delete(schemaId);
      schemaData.delete(schemaId);
    }
  }
  
  if (ws.userId) {
    userSessions.delete(ws.userId);
  }
} 


app.use(cors({
  origin: [FRONTEND_ORIGIN],
  credentials: true,
  allowedHeaders: ['Content-Type','Authorization'],
  exposedHeaders: ['Authorization']
}));

app.use(cookieParser());

app.use(express.json());
app.use(bodyParser.json());

// dist qovluğunu həmişə təqdim et (yalnız production-da yox!)
// MongoDB - Optional for development
if (MONGO_URL) {
  mongoose
    .connect(MONGO_URL)
    .then(() => console.log('✅ MongoDB connected'))
    .catch(err => {
      console.warn('⚠️ MongoDB connection failed:', err.message);
      console.log('📡 Continuing without MongoDB (development mode)');
    });
} else {
  console.log('📡 MongoDB not configured, running in development mode without database');
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// Portfolio routes (protected)
app.use('/api/portfolios', authenticate, portfolioRoutes);

// Database routes (protected)
app.post('/api/databases/check', authenticate, async (req, res) => {
  try {
    const { databaseName } = req.body;
    
    if (!databaseName) {
      return res.status(400).json({ error: 'Database name is required' });
    }
    
    // Check if database exists in MongoDB
    const existingDatabase = await mongoose.connection.db.admin().listDatabases();
    const databaseExists = existingDatabase.databases.some(db => 
      db.name.toLowerCase() === databaseName.toLowerCase()
    );
    
    res.json({ exists: databaseExists });
  } catch (error) {
    console.error('Error checking database existence:', error);
    res.status(500).json({ error: 'Failed to check database existence' });
  }
});

app.post('/api/databases', authenticate, async (req, res) => {
  try {
    const { databaseName, schemaData } = req.body;
    
    if (!databaseName) {
      return res.status(400).json({ error: 'Database name is required' });
    }
    
    // Check if database already exists
    const existingDatabase = await mongoose.connection.db.admin().listDatabases();
    const databaseExists = existingDatabase.databases.some(db => 
      db.name.toLowerCase() === databaseName.toLowerCase()
    );
    
    if (databaseExists) {
      return res.status(409).json({ error: 'A database with this name already exists' });
    }
    
    // Create database and save schema data
    const db = mongoose.connection.useDb(databaseName);
    const schemasCollection = db.collection('schemas');
    
    await schemasCollection.insertOne({
      name: databaseName,
      schemaData,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: req.user.username
    });
    
    res.json({ success: true, message: 'Database created successfully' });
  } catch (error) {
    console.error('Error creating database:', error);
    res.status(500).json({ error: 'Failed to create database' });
  }
});

// server.cjs
// mövcud require-lərin altında
// WorkspaceModel yoxdusa, biz Member modelindən istifadə edib,
// üzvlüyü olan workspaces ID-lərini qaytara bilərik.
app.get('/api/workspaces', authenticate, async (req, res) => {
  try {
    const username = req.query.username;
    if (!username) return res.status(400).json({ error: 'username is required' });
    const memberships = await Member.find({ username }, 'workspaceId role').lean();
    return res.json(memberships);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});


app.get('/api/users/me', authenticate, async (req, res) => {
  try {
    // authenticate middleware req.userId qoyur
    const user = await User.findById(req.userId, 'subscriptionPlan expiresAt fullName email username');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    console.error('GET /api/users/me error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

//Payment
const { PAYPAL_CLIENT_ID, PAYPAL_SECRET, PAYPAL_API_BASE } = process.env;
if (!PAYPAL_CLIENT_ID || !PAYPAL_SECRET || !PAYPAL_API_BASE) {
  console.warn('⚠️ Missing PayPal env vars');
}
const PLAN_PRICES = { pro: '14.90', ultimate: '19.90' };

// ─── Create Order ─────────────────────────────────────────────────────────────
app.post('/api/paypal/create-order', async (req, res) => {
  const { userId, plan } = req.body;
  if (!['pro','ultimate'].includes(plan)) {
    return res.status(400).json({ error: 'Invalid plan' });
  }

  try {
    // 1) OAuth token
    const { data: { access_token } } = await axios({
      url: `${PAYPAL_API_BASE}/v1/oauth2/token`,
      method: 'post',
      auth: { username: PAYPAL_CLIENT_ID, password: PAYPAL_SECRET },
      params: { grant_type: 'client_credentials' }
    });

    // 2) Create order
    const { data: order } = await axios({
      url: `${PAYPAL_API_BASE}/v2/checkout/orders`,
      method: 'post',
      headers: { Authorization: `Bearer ${access_token}` },
      data: {
        intent: 'CAPTURE',
        purchase_units: [{
          amount: { currency_code: 'USD', value: PLAN_PRICES[plan] },
          description: `${plan.toUpperCase()} subscription`
        }],
        application_context: {
          brand_name: 'SizinSite.com',
          return_url:  `${FRONTEND_ORIGIN}/paypal/success`,
          cancel_url:  `${FRONTEND_ORIGIN}/paypal/cancel`,
          user_action: 'PAY_NOW'
        }
      }
    });

    res.json({ orderID: order.id });
  } catch (err) {
    console.error('PayPal create-order error:', err.response?.data || err);
    res.status(500).json({ error: 'PayPal create-order failed' });
  }
});

// ─── Capture Order ────────────────────────────────────────────────────────────
app.post('/api/paypal/capture-order', async (req, res) => {
  const { orderID, userId, plan } = req.body;
  if (!orderID || !userId || !['pro','ultimate'].includes(plan)) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  try {
    // 1) OAuth token again
    const { data: { access_token } } = await axios({
      url: `${PAYPAL_API_BASE}/v1/oauth2/token`,
      method: 'post',
      auth: { username: PAYPAL_CLIENT_ID, password: PAYPAL_SECRET },
      params: { grant_type: 'client_credentials' }
    });

    // 2) Capture payment
    const { data: capture } = await axios({
      url: `${PAYPAL_API_BASE}/v2/checkout/orders/${orderID}/capture`,
      method: 'post',
      headers: { Authorization: `Bearer ${access_token}` }
    });

    if (capture.status === 'COMPLETED') {
      // Compute expiration date: now + 30 days
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      // Update user in DB
      await User.findByIdAndUpdate(userId, {
        subscriptionPlan: plan,
        expiresAt
      });

      // Send confirmation email
      await transporter.sendMail({
        from: `"SizinSite" <${process.env.SMTP_USER}>`,
        to: capture.payer.email_address,
        subject: `${plan.toUpperCase()} plan activated`,
        text: `Salam! Siz ${plan.toUpperCase()} planına keçdiniz. Planınız ${expiresAt.toISOString().slice(0,10)} tarixində bitəcək.`
      });

      return res.json({ success: true, expiresAt });
    } else {
      return res.status(400).json({ error: 'Capture not completed' });
    }
  } catch (err) {
    console.error('PayPal capture error:', err.response?.data || err);
    res.status(500).json({ error: 'PayPal capture failed' });
  }
});

// ─── Daily Cron Job ───────────────────────────────────────────────────────────
cron.schedule('0 0 * * *', async () => {
  console.log('Running daily subscription check…');
  const now = new Date();
  const expiredUsers = await User.find({
    subscriptionPlan: { $in: ['pro','ultimate'] },
    expiresAt: { $lte: now }
  });

  for (let u of expiredUsers) {
    await User.findByIdAndUpdate(u._id, {
      subscriptionPlan: 'free',
      expiresAt:       null
    });

    await transporter.sendMail({
      from: `"SizinSite" <${process.env.SMTP_USER}>`,
      to: u.email,
      subject: 'Your plan has expired',
      text: `Salam ${u.fullName || u.username},\nSizin ${u.subscriptionPlan.toUpperCase()} planınızın müddəti bitdi. Siz Free planına keçdiniz.`
    });
  }
});

// Cron işi: expired planları free-ə çevir
cron.schedule('0 0 * * *', async () => {
  console.log('Running daily subscription check…');
  const now = new Date();
  const users = await User.find({
    subscriptionPlan: { $in: ['pro','ultimate'] },
    expiresAt: { $lte: now }
  });
  for (let u of users) {
    await User.findByIdAndUpdate(u._id, { subscriptionPlan: 'free', expiresAt: null });
    await transporter.sendMail({
      from: `"SizinSite" <${process.env.SMTP_USER}>`,
      to: u.email,
      subject: 'Plan müddəti bitdi',
      text: `Salam ${u.fullName||u.username}, planınız bitdi və Free planına keçdiniz.`
    });
  }
});


//Payment
// SMTP & verification
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 465,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
});
transporter.verify((err) => {
  if (err) console.error('SMTP verify error:', err);
  else console.log('✅ SMTP ready');
});
const verificationCodes = new Map();
function generateCode() {
  return String(crypto.randomInt(100000, 999999));
}

async function sendCode(email, code) {
  return transporter.sendMail({
    from: process.env.SMTP_USER,
    to: email,
    subject: 'Your verification code for DbAutoScripting',
    text: `Your DbAutoScripting verification code is: ${code}`,
    html: `
     <!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Verification Code</title>
  <style>
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    .pulse { animation: pulse 2s infinite; }
    .glow {
      background: linear-gradient(45deg, rgba(59,130,246,0.1), rgba(96,165,250,0.1));
      box-shadow: 0 0 20px rgba(59,130,246,0.3);
    }
  </style>
</head>
<body style="margin:0;padding:0;background:linear-gradient(135deg,#f1f5f9,#dbeafe);font-family:Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 20px 40px rgba(0,0,0,0.1);border:1px solid #dbeafe;">
    <!-- Header -->
    <tr>
      <td style="background:linear-gradient(135deg,#3b82f6,#60a5fa);padding:24px;text-align:center;position:relative;">
        <div style="display:inline-flex;align-items:center;justify-content:center;margin-bottom:8px;">
          <div style="width:40px;height:40px;background:rgba(255,255,255,0.2);border-radius:8px;display:inline-flex;align-items:center;justify-content:center;margin-right:12px;">
            <svg width="24" height="24" fill="white" viewBox="0 0 24 24">
              <path d="M4 6v12a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2z"/>
              <path d="M8 9h8M8 13h6"/>
            </svg>
          </div>
          <h1 style="color:white;font-size:28px;font-weight:bold;margin:0;letter-spacing:1px;">DbAutoScripting</h1>
        </div>
        <p style="color:#bfdbfe;font-size:14px;margin:0;font-weight:500;">Database Automation Platform</p>
      </td>
    </tr>
    
    <!-- Main Content -->
    <tr>
      <td style="padding:40px 32px;text-align:center;">
        <div style="width:64px;height:64px;background:linear-gradient(135deg,#3b82f6,#06b6d4);border-radius:50%;display:inline-flex;align-items:center;justify-content:center;margin-bottom:16px;box-shadow:0 8px 25px rgba(59,130,246,0.3);">
          <svg width="32" height="32" fill="white" viewBox="0 0 24 24">
            <polyline points="20,6 9,17 4,12"/>
          </svg>
        </div>
        <h2 style="color:#1e293b;font-size:32px;font-weight:600;margin:0 0 12px 0;">Verification Required</h2>
        <p style="color:#64748b;font-size:18px;margin:0 0 32px 0;line-height:1.6;">Your verification code for secure database access</p>
        
        <p style="color:#64748b;font-size:16px;margin:0 0 16px 0;font-weight:500;">Enter this code to verify your account:</p>
        
        <!-- Verification Code -->
        <div style="display:inline-block;background:linear-gradient(135deg,#eff6ff,#e0f2fe);border:2px solid #bfdbfe;border-radius:16px;padding:24px 32px;margin:0 0 16px 0;box-shadow:0 8px 25px rgba(59,130,246,0.15);position:relative;" class="glow">
          <div style="font-size:48px;font-weight:bold;color:#3b82f6;letter-spacing:8px;font-family:monospace;margin:0 0 8px 0;">${code}</div>
          <div style="display:flex;justify-content:center;gap:4px;">
            <div style="width:8px;height:8px;background:#60a5fa;border-radius:50%;" class="pulse"></div>
            <div style="width:8px;height:8px;background:#60a5fa;border-radius:50%;" class="pulse"></div>
            <div style="width:8px;height:8px;background:#60a5fa;border-radius:50%;" class="pulse"></div>
          </div>
        </div>
        
        <p style="color:#94a3b8;font-size:14px;margin:0 0 32px 0;">This code expires in 10 minutes</p>
        
        <!-- Security Notice -->
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:24px;margin:0 0 24px 0;text-align:left;">
          <div style="display:flex;align-items:flex-start;gap:12px;">
            <div style="width:40px;height:40px;background:#fef3c7;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;">
              <svg width="20" height="20" fill="#d97706" viewBox="0 0 24 24">
                <path d="M4 6v12a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2z"/>
                <path d="M8 9h8M8 13h6"/>
              </svg>
            </div>
            <div>
              <h3 style="color:#1e293b;font-size:16px;font-weight:600;margin:0 0 4px 0;">Security Notice</h3>
              <p style="color:#64748b;font-size:14px;margin:0;line-height:1.5;">If you did not request this verification code, please ignore this email. Your account security is important to us.</p>
            </div>
          </div>
        </div>
      </td>
    </tr>
    
    <!-- Contact Section -->
    <tr>
      <td style="background:linear-gradient(135deg,#f8fafc,#eff6ff);padding:24px 32px;border-top:1px solid #e2e8f0;">
        <h3 style="color:#1e293b;font-size:16px;font-weight:600;margin:0 0 16px 0;text-align:center;">Need Help?</h3>
        <table width="100%" cellspacing="0" cellpadding="0">
          <tr>
            <td style="text-align:center;padding:4px;">
              <a href="mailto:support@dbautoscripting.com" style="color:#3b82f6;text-decoration:none;font-size:14px;">
                📧 support@dbautoscripting.com
              </a>
            </td>
          </tr>
          <tr>
            <td style="text-align:center;padding:4px;">
              <span style="color:#64748b;font-size:14px;">📞 +994 70 595 10 30</span>
            </td>
          </tr>
          <tr>
            <td style="text-align:center;padding:4px;">
              <a href="https://www.dbautoscripting.com" style="color:#3b82f6;text-decoration:none;font-size:14px;">
                🌐 dbautoscripting.com
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    
    <!-- Footer -->
    <tr>
      <td style="background:#f1f5f9;padding:16px 32px;text-align:center;">
        <p style="color:#94a3b8;font-size:12px;margin:0;">© 2025 DbAutoScripting. All rights reserved.</p>
      </td>
    </tr>
  </table>
</body>
</html>
    `
  });
}
//Code Send method in team collabration
// server.cjs üzərində, mövcud `/api/portfolios`–dən əvvəl:

// 1) İstifadəçi yoxlamaq üçün
app.post('/api/users/validate', async (req, res) => {
  try {
    console.log('Validating username:', req.body);
    const { username } = req.body;
    
    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }
    
    // MongoDB User kolleksiyanız
    const exists = await User.exists({ username });
    console.log('Username exists check result:', { username, exists: !!exists });
    return res.json({ exists: !!exists });
  } catch (err) {
    console.error('Username validation error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// 2) Invitation modelləri üçün
//const Invitation = require('./src/models/Invitation.cjs');
app.post('/api/invitations', authenticate, async (req, res) => {
  try {
    console.log('Creating invitation:', req.body);
    
    // Validate required fields
    const { workspaceId, inviterUsername, inviteeUsername, role, joinCode } = req.body;
    
    if (!workspaceId || !inviterUsername || !inviteeUsername || !role || !joinCode) {
      return res.status(400).json({ 
        error: 'Missing required fields: workspaceId, inviterUsername, inviteeUsername, role, joinCode' 
      });
    }
    
    // Check if invitation already exists
    const existingInvitation = await Invitation.findOne({
      workspaceId,
      inviteeUsername,
      status: 'pending'
    });
    
    if (existingInvitation) {
      return res.status(400).json({ 
        error: 'User already has a pending invitation for this workspace' 
      });
    }
    
    // Create new invitation
    const invitationData = {
      workspaceId,
      inviterUsername,
      inviteeUsername,
      role,
      joinCode: joinCode.toUpperCase(),
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      status: 'pending'
    };
    
    const inv = new Invitation(invitationData);
    await inv.save();
    
    console.log('Invitation saved successfully:', inv._id);
    res.status(201).json({
      id: inv._id,
      workspaceId: inv.workspaceId,
      inviterUsername: inv.inviterUsername,
      inviteeUsername: inv.inviteeUsername,
      role: inv.role,
      joinCode: inv.joinCode,
      createdAt: inv.createdAt,
      expiresAt: inv.expiresAt,
      status: inv.status
    });
  } catch (err) {
    console.error('Error saving invitation:', err);
    res.status(500).json({ error: 'Failed to save invitation' });
  }
});

app.get('/api/invitations', authenticate, async (req, res) => {
  try {
    const { workspaceId } = req.query;
    console.log('Fetching invitations for workspace:', workspaceId);
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId is required' });
    }
    
    const list = await Invitation.find({ workspaceId });
    console.log('Found invitations:', list.length);
    res.json(list);
  } catch (err) {
    console.error('Error fetching invitations:', err);
    res.status(500).json({ error: 'Failed to fetch invitations' });
  }
});

// New endpoint: Validate join code
app.post('/api/invitations/validate', authenticate, async (req, res) => {
  try {
    const { joinCode } = req.body;
    console.log('Validating join code:', joinCode);
    
    if (!joinCode || joinCode.length !== 8) {
      return res.status(400).json({ 
        valid: false, 
        error: 'Join code must be exactly 8 characters' 
      });
    }
    
    // Find invitation by join code (case insensitive)
    const invitation = await Invitation.findOne({ 
      joinCode: { $regex: new RegExp(`^${joinCode.toUpperCase()}$`, 'i') },
      status: 'pending'
    });
    
    if (!invitation) {
      console.log('No invitation found for code:', joinCode);
      return res.json({ 
        valid: false, 
        error: 'Invalid join code' 
      });
    }
    
    // Check if expired
    if (new Date() > invitation.expiresAt) {
      // Update status to expired
      await Invitation.findByIdAndUpdate(invitation._id, { status: 'expired' });
      console.log('Invitation expired:', invitation._id);
      return res.json({ 
        valid: false, 
        error: 'Join code has expired' 
      });
    }
    
    console.log('Valid invitation found:', invitation._id);
    res.json({ 
      valid: true, 
      invitation: {
        id: invitation._id,
        workspaceId: invitation.workspaceId,
        inviterUsername: invitation.inviterUsername,
        inviteeUsername: invitation.inviteeUsername,
        role: invitation.role,
        joinCode: invitation.joinCode,
        createdAt: invitation.createdAt,
        expiresAt: invitation.expiresAt,
        status: invitation.status
      }
    });
  } catch (err) {
    console.error('Error validating join code:', err);
    res.status(500).json({ 
      valid: false, 
      error: 'Server error during validation' 
    });
  }
});

// Update invitation status
app.put('/api/invitations/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    console.log('Updating invitation status:', id, status);
    
    if (!['pending', 'accepted', 'expired'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    
    const updated = await Invitation.findByIdAndUpdate(
      id, 
      { status, updatedAt: new Date() }, 
      { new: true }
    );
    
    if (!updated) {
      return res.status(404).json({ error: 'Invitation not found' });
    }
    
    console.log('Invitation status updated successfully');
    res.json(updated);
  } catch (err) {
    console.error('Update invitation error:', err);
    res.status(500).json({ error: 'Failed to update invitation' });
  }
});

// 3) WorkspaceMember modelləri üçün
//const Member = require('./src/models/Member.cjs');
app.post('/api/members', authenticate, async (req, res) => {
  try {
    console.log('Creating workspace member:', req.body);
    
    // Validate required fields
    const { workspaceId, id, username, role } = req.body;
    
    if (!workspaceId || !id || !username || !role) {
      return res.status(400).json({ 
        error: 'Missing required fields: workspaceId, id, username, role' 
      });
    }
    
    // Check if member already exists
    const existingMember = await Member.findOne({
      workspaceId,
      username
    });
    
    if (existingMember) {
      return res.status(400).json({ 
        error: 'User is already a member of this workspace' 
      });
    }
    
    // Create new member
    const memberData = {
      workspaceId,
      id,
      username,
      role,
      joinedAt: new Date()
    };
    
    const m = new Member(memberData);
    await m.save();
    
    console.log('Member saved successfully:', m._id);
    res.status(201).json({
      id: m._id,
      workspaceId: m.workspaceId,
      memberId: m.id,
      username: m.username,
      role: m.role,
      joinedAt: m.joinedAt
    });
  } catch (err) {
    console.error('Error saving member:', err);
    res.status(500).json({ error: 'Failed to save member' });
  }
});

app.get('/api/members', authenticate, async (req, res) => {
  try {
    const { workspaceId } = req.query;
    console.log('Fetching members for workspace:', workspaceId);
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId is required' });
    }
    
    const list = await Member.find({ workspaceId });
    console.log('Found members:', list.length);
    res.json(list);
  } catch (err) {
    console.error('Error fetching members:', err);
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

// 4) Workspace güncəlləmək üçün
app.put('/api/workspaces/:id', authenticate, async (req, res) => {
  try {
    console.log('Updating workspace:', req.params.id);
    // workspace modeliniz varsa:
    const { id } = req.params;
    
    // For now, just return success since we don't have a Workspace model
    // In a real implementation, you would update the workspace in MongoDB
    console.log('Workspace update data:', req.body);
    res.json({ success: true, message: 'Workspace updated successfully' });
  } catch (err) {
    console.error('Error updating workspace:', err);
    res.status(500).json({ error: 'Failed to update workspace' });
  }
});

//

app.post('/api/contact', async (req, res) => {
  const { name, email, message } = req.body;
  if (!name || !email || !message) {
    return res.status(400).json({ error: 'All fields are required.' });
  }
  try {
    await transporter.sendMail({
      from: `"${name}" <${email}>`,
      to: 'piriyevtural00@gmail.com',
      subject: `New Contact Message from ${name}`,
      text: `
Name: ${name}
Email: ${email}

Message:
${message}
      `,
      html: `
        <h3>New Contact Form Message</h3>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Message:</strong><br/>${message.replace(/\n/g,'<br/>')}</p>
      `
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Error sending contact email:', err);
    res.status(500).json({ error: 'Failed to send email.' });
  }
});
// Auth routes
app.post('/api/register', async (req, res) => {
  try {
    const { fullName, username, email, phone, password } = req.body;
    const conflict = await User.findOne({ $or: [{ email }, { phone }, { username }] });
    if (conflict) {
      const field = conflict.email===email ? 'Email'
                  : conflict.phone===phone ? 'Phone'
                  : 'Username';
      return res.status(400).json({ message: `${field} already registered` });
    }
    const code = generateCode(), expires = Date.now() + 5*60_000;
    const hashed = await bcrypt.hash(password, 10);
    verificationCodes.set(email, { code, expires, data:{ fullName, username, email, phone, password:hashed } });
    await sendCode(email, code);
    res.json({ message: 'Verification code sent' });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

app.post('/api/verify-code', async (req, res) => {
  try {
    const { email, code } = req.body;
    const rec = verificationCodes.get(email);
    if (!rec) return res.status(400).json({ message: 'No pending registration' });
    if (rec.code!==code) return res.status(400).json({ message: 'Invalid code' });
    if (Date.now()>rec.expires) {
      verificationCodes.delete(email);
      return res.status(400).json({ message: 'Code expired' });
    }
    const newUser = await new User(rec.data).save();
    verificationCodes.delete(email);
    const payload = { userId:newUser._id, email:newUser.email };
    const token   = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '1d' });
    const uobj    = newUser.toObject(); delete uobj.password;
    res.status(201).json({ message:'User registered', token, user:uobj });
  } catch (err) {
    console.error('Verify-code error:', err);
    res.status(500).json({ message: 'Server error during code verification' });
  }
});

app.post('/api/resend-code', async (req, res) => {
  try {
    const { email } = req.body;
    const rec = verificationCodes.get(email);
    if (!rec) return res.status(404).json({ message:'No pending registration' });
    rec.code = generateCode(); rec.expires = Date.now() + 5*60_000;
    await sendCode(email, rec.code);
    res.json({ message:'New code sent' });
  } catch (err) {
    console.error('Resend-code error:', err);
    res.status(500).json({ message:'Server error during resend' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message:'Invalid email or password' });
    }
    const payload = { userId:user._id, email:user.email };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '1d' });
    const uobj = user.toObject(); delete uobj.password;

     res.cookie('token', token, {
     httpOnly: true,
     secure: process.env.NODE_ENV === 'production',
     sameSite: 'none',
     maxAge: 24 * 60 * 60 * 1000, // 1 gün
   });
    res.json({ message:'Login successful', token, user:uobj });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message:'Server error during login' });
  }
});

// Optional: serve React in production...
// const dist = path.join(__dirname, 'dist');
// app.use(express.static(dist));
// app.get('*', (req, res) => {
//   if (req.path.startsWith('/api')) return res.status(404).json({ message: 'API not found' });
//   res.sendFile(path.join(dist, 'index.html'));
// });
//Paypal Payment
// server.cjs içində (əvvəlcə require/axios və dotenv.config() olmalı)
app.post('/api/paypal/create-order', async (req, res) => {
  const { plan } = req.body;          // plan: 'pro' | 'ultimate'
  const priceMap = { pro: '10.00', ultimate: '25.00' };
  const amount = priceMap[plan];
  if (!amount) return res.status(400).send('Invalid plan');

  // 1) OAuth token al
  const { data: { access_token } } = await axios({
    url: `${process.env.PAYPAL_API_BASE}/v1/oauth2/token`,
    method: 'post',
    auth: { username: process.env.PAYPAL_CLIENT_ID, password: process.env.PAYPAL_SECRET },
    params: { grant_type: 'client_credentials' }
  });

  // 2) Order yarat
  const { data: order } = await axios({
    url: `${process.env.PAYPAL_API_BASE}/v2/checkout/orders`,
    method: 'post',
    headers: { Authorization: `Bearer ${access_token}` },
    data: {
      intent: 'CAPTURE',
      purchase_units: [{ amount: { currency_code: 'USD', value: amount } }],
      application_context: {
        brand_name: 'DbAutoScripting',
        user_action: 'PAY_NOW',
      }
    }
  });

  res.json({ orderID: order.id });
});
app.post('/api/paypal/capture-order', async (req, res) => {
  const { orderID, plan, userId } = req.body;
  if (!orderID || !plan || !userId) return res.status(400).end();

  // 1) Aynı token yukle
  const { data: { access_token } } = await axios({
    url: `${process.env.PAYPAL_API_BASE}/v1/oauth2/token`,
    method: 'post',
    auth: { username: process.env.PAYPAL_CLIENT_ID, password: process.env.PAYPAL_SECRET },
    params: { grant_type: 'client_credentials' }
  });

  // 2) Ödənişi təsdiq et
  const { data: capture } = await axios({
    url: `${process.env.PAYPAL_API_BASE}/v2/checkout/orders/${orderID}/capture`,
    method: 'post',
    headers: { Authorization: `Bearer ${access_token}` }
  });

  if (capture.status === 'COMPLETED') {
    // 3) MongoDB-də istifadəçi planını yenilə
    await User.findByIdAndUpdate(userId, { subscriptionPlan: plan });
    return res.json({ success: true, details: capture });
  } else {
    return res.status(500).json({ success: false, error: 'Capture failed' });
  }
});

app.ws('/ws/collaboration/:schemaId', (ws, req) => {
  const schemaId = req.params.schemaId;
  const clientId = `collab_${schemaId}_${Date.now()}`;
  console.log(`👥 [${clientId}] Collaboration socket opened for schema: ${schemaId}`);

  ws.schemaId = schemaId;
  ws.clientId = clientId;
  ws.isAlive = true;
  ws.connectedAt = Date.now();

  // Add connection to schema group
  if (!connections.has(schemaId)) {
    connections.set(schemaId, new Set());
  }
  connections.get(schemaId).add(ws);

  // Send connection established message
  ws.send(JSON.stringify({
    type: 'connection_established',
    clientId: clientId,
    schemaId: schemaId,
    timestamp: new Date().toISOString()
  }));

  // Send current users in schema
  const schemaConnections = connections.get(schemaId);
  if (schemaConnections) {
    const currentUsers = Array.from(schemaConnections)
      .filter(conn => conn.userId && conn.username)
      .map(conn => ({
        id: conn.userId,
        username: conn.username,
        role: conn.role || 'editor',
        color: conn.color || '#3B82F6',
        isOnline: true
      }));
    
    if (currentUsers.length > 0) {
      ws.send(JSON.stringify({
        type: 'current_users',
        users: currentUsers
      }));
    }
  }

  // Handle incoming messages
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log(`📨 [${clientId}] Received:`, message.type);

      switch (message.type) {
        case 'user_join':
          ws.userId = message.userId;
          ws.username = message.username;
          ws.role = message.role || 'editor';
          ws.color = message.color || '#3B82F6';
          userSessions.set(message.userId, ws);
          
          // Broadcast user joined to others
          broadcastToSchema(schemaId, {
            type: 'user_joined',
            user: {
              id: message.userId,
              username: message.username,
              role: ws.role,
              color: ws.color,
              joinedAt: new Date().toISOString()
            }
          }, message.userId);
          
          console.log(`👋 [${clientId}] User ${message.username} (${ws.role}) joined schema ${schemaId}`);
          break;
          
        case 'user_leave':
          broadcastToSchema(schemaId, {
            type: 'user_left',
            userId: message.userId,
            username: message.username
          }, message.userId);
          
          console.log(`👋 [${clientId}] User ${message.username} left schema ${schemaId}`);
          break;
          
        case 'cursor_update':
          // Validate cursor data before broadcasting
          if (message.cursor && 
              typeof message.cursor === 'object' && 
              message.cursor.userId && 
              typeof message.cursor.userId === 'string') {
            
            // Add timestamp to cursor data
            const cursorData = {
              ...message.cursor,
              timestamp: new Date().toISOString()
            };
            
            // Broadcast cursor position to other users
            broadcastToSchema(schemaId, {
              type: 'cursor_update',
              data: cursorData
            }, message.cursor.userId);
            
            console.log(`📍 [${clientId}] Cursor update from ${message.cursor.username || message.cursor.userId} broadcasted`);
          } else {
            console.warn('⚠️ Invalid cursor_update message received:', {
              hasCursor: !!message.cursor,
              cursorType: typeof message.cursor,
              hasUserId: !!message.cursor?.userId,
              userIdType: typeof message.cursor?.userId,
              fullMessage: message
            });
            
            // Send error response to sender only
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Invalid cursor_update format. Expected cursor object with userId.'
            }));
          }
          break;
          
        case 'schema_change':
          // Validate schema change data
          if (!message.changeType || !message.data) {
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Invalid schema_change format. Expected changeType and data.'
            }));
            break;
          }
          
          // Store schema data for this workspace
          if (!schemaData.has(schemaId)) {
            schemaData.set(schemaId, {});
          }
          
          // Update schema data
          const currentSchemaData = schemaData.get(schemaId);
          currentSchemaData[message.changeType] = message.data;
          currentSchemaData.lastUpdate = new Date().toISOString();
          currentSchemaData.lastUpdatedBy = message.userId;
          
          // Broadcast schema changes to all users
          const schemaChangeMessage = {
            type: 'schema_change',
            changeType: message.changeType,
            data: message.data,
            userId: message.userId,
            username: message.username,
            timestamp: new Date().toISOString()
          };
          
          broadcastToSchema(schemaId, schemaChangeMessage, message.userId);
          
          console.log(`🔄 [${clientId}] Schema change: ${message.changeType} by ${message.username || message.userId}`);
          break;
          
        case 'table_created':
        case 'table_updated':
        case 'table_deleted':
        case 'relationship_added':
        case 'relationship_removed':
          // Handle specific schema operations
          const operationMessage = {
            type: 'schema_operation',
            operation: message.type,
            data: message.data,
            userId: message.userId,
            username: message.username,
            timestamp: new Date().toISOString()
          };
          
          broadcastToSchema(schemaId, operationMessage, message.userId);
          console.log(`🔄 [${clientId}] Schema operation: ${message.type} by ${message.username || message.userId}`);
          break;
          
        case 'user_selection':
          // Broadcast user selection to other users
          broadcastToSchema(schemaId, {
            type: 'user_selection',
            data: {
              ...message.data,
              timestamp: new Date().toISOString()
            }
          }, message.data?.userId);
          break;
          
        case 'presence_update':
          // Broadcast presence updates
          broadcastToSchema(schemaId, {
            type: 'presence_update',
            data: {
              ...message.data,
              timestamp: new Date().toISOString()
            }
          }, message.data?.userId);
          break;
          
        case 'get_schema_data':
          // Send current schema data to requesting user
          const schemaDataForUser = schemaData.get(schemaId) || {};
          ws.send(JSON.stringify({
            type: 'schema_data',
            data: schemaDataForUser,
            timestamp: new Date().toISOString()
          }));
          break;
          
        case 'ping':
          // Respond to heartbeat
          ws.send(JSON.stringify({ type: 'pong' }));
          break;
          
        default:
          console.log(`❓ [${clientId}] Unknown message type: ${message.type}`);
      }
    } catch (error) {
      console.error('❌ Error processing WebSocket message:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid message format'
      }));
    }
  });
  
  // Handle connection close
  ws.on('close', (code, reason) => {
    console.log(`👥 [${clientId}] Socket closed - Code: ${code}, Reason: ${reason}`);
    
    if (ws.userId) {
      // Notify other users that this user has left
      broadcastToSchema(schemaId, {
        type: 'user_left',
        userId: ws.userId,
        username: ws.username
      }, ws.userId);
      
      console.log(`👋 [${clientId}] User ${ws.username} disconnected from schema ${schemaId}`);
    }
    
    cleanupConnection(ws, schemaId);
  });
  
  // Handle errors
  ws.on('error', (error) => {
    console.error(`❌ WebSocket error for user ${ws.userId || 'unknown'}:`, error);
    cleanupConnection(ws, schemaId);
  });
});
// server.cjs (express-ws konfiqurasiyasından sonra)
app.ws('/ws/portfolio-updates', (ws, req) => {
  const clientId = `portfolio_${Date.now()}`;
  console.log(`📋 [${clientId}] Client subscribed to portfolio-updates`);

  // Send welcome message
  ws.send(JSON.stringify({
    type: 'portfolio_connection_established',
    clientId,
    timestamp: new Date().toISOString()
  }));

  // Reduced heartbeat to prevent frequent disconnections
  const heartbeat = setInterval(() => {
    if (ws.readyState === 1) {
      try {
        ws.ping();
      } catch (error) {
        console.error(`📋 [${clientId}] Ping failed:`, error);
        clearInterval(heartbeat);
      }
    } else {
      console.log(`📋 [${clientId}] WebSocket not ready, clearing heartbeat`);
      clearInterval(heartbeat);
    }
  }, 60000); // Increase to 60 seconds

  // Nümunə: maqəzaları broadcast etmək üçün:
  ws.on('message', msg => {
    try {
      const message = JSON.parse(msg.toString());
      console.log(`📋 [${clientId}] Received message:`, message.type);
      
      // Gələn portfolio yenilənməsini bütün digər client-lərə yolla
      wsInstance.getWss().clients.forEach(client => {
        if (client !== ws && client.readyState === 1) {
          client.send(msg);
        }
      });
    } catch (error) {
      console.error(`📋 [${clientId}] Error processing message:`, error);
    }
  });

  ws.on('close', (code, reason) => {
    console.log(`📋 [${clientId}] Socket closed - Code: ${code}, Reason: ${reason}`);
    clearInterval(heartbeat);
  });

  ws.on('error', (error) => {
    console.error(`📋 [${clientId}] Socket error:`, error);
    clearInterval(heartbeat);
  });

  ws.on('pong', () => {
    console.log(`📋 [${clientId}] Pong received`);
  });
});

const distPath = path.join(__dirname, "dist");
app.use(express.static(distPath));

// SPA üçün fallback: bütün GET istəkləri index.html-ə yönlənsin
app.get(/^\/(?!api).*/, (req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

//
// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ message:'Internal Server Error' });
});

// if (process.env.NODE_ENV === 'production') {
//   const dist = path.join(__dirname, 'dist');
//   app.use(express.static(dist));
//   app.get('*', (req, res) => {
//     res.sendFile(path.join(dist, 'index.html'));
//   });
// }

// Start
app.listen(PORT, '0.0.0.0', () => {
   console.log(`✅ Server running on port ${PORT} (env: ${process.env.NODE_ENV})`);
 });

// User management endpoints
app.post('/api/users/online', authenticate, async (req, res) => {
  try {
    const { userId, schemaId } = req.body;
    
    // Update user online status in database
    await User.findByIdAndUpdate(userId, {
      isOnline: true,
      lastSeen: new Date(),
      currentWorkspace: schemaId
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating user online status:', error);
    res.status(500).json({ error: 'Failed to update user status' });
  }
});

app.post('/api/users/offline', authenticate, async (req, res) => {
  try {
    const { userId, schemaId } = req.body;
    
    // Update user offline status in database
    await User.findByIdAndUpdate(userId, {
      isOnline: false,
      lastSeen: new Date(),
      currentWorkspace: null
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating user offline status:', error);
    res.status(500).json({ error: 'Failed to update user status' });
  }
});

app.post('/api/users/presence', authenticate, async (req, res) => {
  try {
    const { userId, status, currentAction, schemaId } = req.body;
    
    // Update user presence in database
    await User.findByIdAndUpdate(userId, {
      presence: status,
      currentAction,
      lastSeen: new Date()
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating user presence:', error);
    res.status(500).json({ error: 'Failed to update user presence' });
  }
});

// Workspace collaboration endpoints
app.get('/api/workspaces/:workspaceId/members', authenticate, async (req, res) => {
  try {
    const { workspaceId } = req.params;
    
    // Get workspace members from database
    const members = await Member.find({ workspaceId }).populate('userId', 'username email avatar');
    
    const memberData = members.map(member => ({
      id: member.userId._id,
      username: member.userId.username,
      role: member.role,
      joinedAt: member.joinedAt,
      isOnline: member.userId.isOnline || false,
      lastSeen: member.userId.lastSeen,
      color: member.userId.color || '#3B82F6'
    }));
    
    res.json({ members: memberData });
  } catch (error) {
    console.error('Error getting workspace members:', error);
    res.status(500).json({ error: 'Failed to get workspace members' });
  }
});

app.get('/api/workspaces/:workspaceId/invitations', authenticate, async (req, res) => {
  try {
    const { workspaceId } = req.params;
    
    // Get workspace invitations from database
    const invitations = await Invitation.find({ workspaceId }).populate('inviterId', 'username');
    
    res.json({ invitations });
  } catch (error) {
    console.error('Error getting workspace invitations:', error);
    res.status(500).json({ error: 'Failed to get workspace invitations' });
  }
});

// Schema changes tracking
app.post('/api/schema/changes', authenticate, async (req, res) => {
  try {
    const { schemaId, changeType, data, userId, timestamp } = req.body;
    
    // Save schema change to database
    const schemaChange = new SchemaChange({
      schemaId,
      changeType,
      data,
      userId,
      timestamp: new Date(timestamp)
    });
    
    await schemaChange.save();
    
    res.json({ success: true, changeId: schemaChange._id });
  } catch (error) {
    console.error('Error saving schema change:', error);
    res.status(500).json({ error: 'Failed to save schema change' });
  }
});

app.post('/api/schema/operations', authenticate, async (req, res) => {
  try {
    const { schemaId, operation, data, userId, timestamp } = req.body;
    
    // Save schema operation to database
    const schemaOperation = new SchemaOperation({
      schemaId,
      operation,
      data,
      userId,
      timestamp: new Date(timestamp)
    });
    
    await schemaOperation.save();
    
    res.json({ success: true, operationId: schemaOperation._id });
  } catch (error) {
    console.error('Error saving schema operation:', error);
    res.status(500).json({ error: 'Failed to save schema operation' });
  }
});

// Get schema changes history
app.get('/api/schema/:schemaId/changes', authenticate, async (req, res) => {
  try {
    const { schemaId } = req.params;
    const { limit = 50 } = req.query;
    
    // Get recent schema changes from database
    const changes = await SchemaChange.find({ schemaId })
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .populate('userId', 'username');
    
    res.json({ changes });
  } catch (error) {
    console.error('Error getting schema changes:', error);
    res.status(500).json({ error: 'Failed to get schema changes' });
  }
});

// Authentication endpoints
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );
    
    // Update user online status
    user.isOnline = true;
    user.lastSeen = new Date();
    await user.save();
    
    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        isOnline: user.isOnline,
        lastSeen: user.lastSeen
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    // Check if user already exists
    const existingUser = await User.findOne({ 
      $or: [{ email }, { username }] 
    });
    
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create new user
    const user = new User({
      username,
      email,
      password: hashedPassword,
      role: 'editor',
      isOnline: true,
      lastSeen: new Date()
    });
    
    await user.save();
    
    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );
    
    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        isOnline: user.isOnline,
        lastSeen: user.lastSeen
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.get('/api/auth/me', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        isOnline: user.isOnline,
        lastSeen: user.lastSeen
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});
