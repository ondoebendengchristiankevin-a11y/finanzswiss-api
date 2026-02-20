const express = require('express');
const serverless = require('serverless-http');
const nodemailer = require('nodemailer');
const cors = require('cors');

const app = express();
const router = express.Router();

// MIDDLEWARES - Ordre important !
app.use(cors());
app.use(express.json()); // Parse automatiquement le JSON

// --- CONFIGURATION IDENTITÉ VISUELLE FINANZSWISS ---
const LOGO_URL = "https://res.cloudinary.com/dr3raped0/image/upload/v1769825772/Logo_njzwt8.png"; 
const BRAND_RED = "#e60000";
const DARK_BLUE = "#020817";
const TEXT_DARK = "#1a1a1a";
const BG_LIGHT = "#f4f7f9";

const transporter = nodemailer.createTransport({
  host: 'smtp.hostinger.com',
  port: 587,
  secure: true,
  auth: {
    user: 'kunden.support@finanzswiss.com',
    pass: process.env.EMAIL_PASS 
  }
});

/**
 * WRAPPER EMAIL PREMIUM
 */
const getEmailWrapper = (titre, contenu, ip) => `
  <div style="background-color: ${BG_LIGHT}; padding: 40px 20px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
    <div style="max-width: 650px; margin: auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.1); border: 1px solid #e1e8ed;">
      
      <div style="background-color: ${DARK_BLUE}; padding: 40px 20px; text-align: center;">
        <img src="${LOGO_URL}" alt="FinanzSwiss Logo" style="height: 45px; width: auto; margin-bottom: 20px;">
        <h1 style="color: white; font-size: 12px; margin: 0; text-transform: uppercase; letter-spacing: 5px; font-weight: 300;">
          FINANZ<span style="color: ${BRAND_RED}; font-weight: 900;">SWISS</span> AG
        </h1>
        <div style="margin-top: 25px; display: inline-block; padding: 8px 20px; background-color: ${BRAND_RED}; color: white; font-size: 12px; border-radius: 50px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">
          ${titre}
        </div>
      </div>

      <div style="padding: 40px; color: ${TEXT_DARK};">
        ${contenu}
        
        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; font-size: 11px; color: #999; line-height: 1.5;">
          <strong>Sécurité & Traçabilité :</strong><br>
          Cette demande a été soumise le ${new Date().toLocaleString('fr-FR')} depuis l'adresse IP : <span style="color: ${BRAND_RED}; font-weight: bold;">${ip}</span>.
        </div>
      </div>

      <div style="padding: 20px; background-color: ${DARK_BLUE}; text-align: center;">
        <p style="font-size: 10px; color: #ffffff; opacity: 0.6; margin: 0; text-transform: uppercase; letter-spacing: 1px;">
          © ${new Date().getFullYear()} FinanzSwiss AG • Département des Risques • Zürich
        </p>
      </div>
    </div>
  </div>
`;

/**
 * Formate un nombre en devise
 */
const formatCurrency = (amount, currency) => {
  if (amount === null || amount === undefined || amount === '') return 'Non spécifié';
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
};

// --- ROUTE 1 : DEMANDE DE PRÊT ---
router.post('/loan', async (req, res) => {
  try {
    const data = req.body;
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'IP Inconnue';

    // LOGS DE DÉBOGAGE
    console.log('🔍 BODY COMPLET REÇU:', JSON.stringify(data, null, 2));
    console.log('🔍 monthlyIncome:', data.monthlyIncome);
    console.log('🔍 incomeCurrency:', data.incomeCurrency);
    console.log('🔍 loanCurrency:', data.loanCurrency);

    // Validation des champs requis
    const requiredFields = [
      'firstName', 'lastName', 'birthDate', 'phone', 'email', 
      'address', 'city', 'country', 'loanType', 'situation', 
      'amount', 'months'
    ];

    const missingFields = requiredFields.filter(field => !data[field]);
    
    if (missingFields.length > 0) {
      return res.status(400).json({ 
        error: `Champs requis manquants: ${missingFields.join(', ')}` 
      });
    }

    // TRAITEMENT ROBUSTE DU REVENU MENSUEL
    const monthlyIncome = 
      typeof data.monthlyIncome !== 'undefined' && 
      data.monthlyIncome !== '' && 
      data.monthlyIncome !== null
        ? Number(data.monthlyIncome)
        : null;

    // Récupération des devises
    const loanCurrency = data.loanCurrency || 'CHF';
    const incomeCurrency = data.incomeCurrency || loanCurrency;

    // Conversion des valeurs numériques
    const amount = Number(data.amount) || 0;
    const months = Number(data.months) || 0;

    // Calcul de la mensualité
    let monthlyPayment = 0;
    if (amount > 0 && months > 0) {
      const r = 0.04 / 12;
      monthlyPayment = (amount * r) / (1 - Math.pow(1 + r, -months));
    }

    // Vérification des devises
    const currenciesMatch = loanCurrency === incomeCurrency;
    
    // Avertissement si devises différentes
    const currencyWarning = !currenciesMatch && monthlyIncome !== null ? `
      <div style="margin-top: 15px; padding: 12px; background: #fff3cd; border-radius: 8px; border-left: 4px solid #f39c12;">
        <p style="margin: 0; font-size: 13px; color: #856404;">
          ⚠️ <strong>Attention:</strong> Le revenu est en ${incomeCurrency} mais le prêt est en ${loanCurrency}.
        </p>
      </div>
    ` : '';

    // CONSTRUCTION DE L'EMAIL POUR LE CONSEILLER
    const htmlContent = `
      <h2 style="font-size: 22px; color: ${DARK_BLUE}; margin-bottom: 30px; border-bottom: 2px solid ${BRAND_RED}; padding-bottom: 10px;">
        📋 Récapitulatif de la Demande
      </h2>
      
      <!-- MONTANT DU PRÊT -->
      <div style="background: linear-gradient(135deg, ${DARK_BLUE} 0%, #0f1a2f 100%); color: white; padding: 25px; border-radius: 12px; margin-bottom: 30px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <div style="flex: 1;">
            <p style="margin: 0; font-size: 11px; text-transform: uppercase; opacity: 0.7;">Montant du prêt</p>
            <p style="margin: 5px 0 0 0; font-size: 32px; font-weight: 900; color: ${BRAND_RED};">${formatCurrency(amount, loanCurrency)}</p>
          </div>
          <div style="flex: 1; text-align: right; border-left: 1px solid rgba(255,255,255,0.1); padding-left: 20px;">
            <p style="margin: 0; font-size: 11px; text-transform: uppercase; opacity: 0.7;">Mensualité (Est.)</p>
            <p style="margin: 5px 0 0 0; font-size: 28px; font-weight: 700; color: ${BRAND_RED};">${formatCurrency(monthlyPayment, loanCurrency)}</p>
          </div>
        </div>
        
        <div style="display: flex; justify-content: space-between; background: rgba(255,255,255,0.1); padding: 15px; border-radius: 8px;">
          <div>
            <p style="margin: 0; font-size: 11px; text-transform: uppercase; opacity: 0.7;">Durée</p>
            <p style="margin: 5px 0 0 0; font-size: 16px; font-weight: bold;">${months} mois (${(months/12).toFixed(1)} ans)</p>
          </div>
          <div>
            <p style="margin: 0; font-size: 11px; text-transform: uppercase; opacity: 0.7;">Taux annuel</p>
            <p style="margin: 5px 0 0 0; font-size: 16px; font-weight: bold;">4.0%</p>
          </div>
        </div>
      </div>

      <!-- SECTION REVENU MENSUEL (ENCADRÉE POUR VISIBILITÉ) -->
      <div style="margin-bottom: 30px; border: 2px solid ${BRAND_RED}; border-radius: 12px; overflow: hidden;">
        <div style="background-color: ${BRAND_RED}; padding: 10px 20px;">
          <h3 style="margin: 0; color: white; font-size: 16px; text-transform: uppercase;">💰 REVENU MENSUEL</h3>
        </div>
        <div style="background: #f8f9fa; padding: 20px;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">
            <div>
              <p style="margin: 0; font-size: 16px; color: #666;">Revenu mensuel net déclaré</p>
              <p style="margin: 5px 0 0 0; font-size: 14px; color: #888;">Devise: <strong style="font-size: 16px; color: ${DARK_BLUE};">${incomeCurrency}</strong></p>
            </div>
            <div style="text-align: right;">
              <p style="margin: 0; font-size: 32px; font-weight: 900; color: ${DARK_BLUE};">
                ${monthlyIncome !== null ? formatCurrency(monthlyIncome, incomeCurrency) : 'Non spécifié'}
              </p>
            </div>
          </div>
        </div>
        ${currencyWarning}
      </div>

      <!-- IDENTITÉ -->
      <div style="margin-bottom: 30px;">
        <h3 style="font-size: 14px; text-transform: uppercase; color: ${BRAND_RED}; margin-bottom: 15px;">👤 Identité</h3>
        <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
          <tr><td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0;">Nom complet</td><td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; text-align: right; font-weight: bold;">${data.firstName} ${data.lastName}</td></tr>
          <tr><td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0;">Date de naissance</td><td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; text-align: right; font-weight: bold;">${new Date(data.birthDate).toLocaleDateString('fr-FR')}</td></tr>
          <tr><td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0;">Email</td><td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; text-align: right; font-weight: bold;">${data.email}</td></tr>
          <tr><td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0;">Téléphone</td><td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; text-align: right; font-weight: bold;">${data.phone}</td></tr>
        </table>
      </div>

      <!-- LOCALISATION -->
      <div style="margin-bottom: 30px;">
        <h3 style="font-size: 14px; text-transform: uppercase; color: ${BRAND_RED}; margin-bottom: 15px;">📍 Localisation</h3>
        <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
          <tr><td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0;">Adresse</td><td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; text-align: right; font-weight: bold;">${data.address}</td></tr>
          <tr><td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0;">Ville</td><td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; text-align: right; font-weight: bold;">${data.city}</td></tr>
          <tr><td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0;">Pays</td><td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; text-align: right; font-weight: bold;">${data.country}</td></tr>
        </table>
      </div>

      <!-- PROFIL -->
      <div style="margin-bottom: 30px;">
        <h3 style="font-size: 14px; text-transform: uppercase; color: ${BRAND_RED}; margin-bottom: 15px;">💼 Profil</h3>
        <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
          <tr><td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0;">Situation</td><td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; text-align: right; font-weight: bold;">${data.situation}</td></tr>
          <tr><td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0;">Type de crédit</td><td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; text-align: right; font-weight: bold;">${data.loanType}</td></tr>
          <tr><td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0;">Devise du prêt</td><td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; text-align: right; font-weight: bold;">${loanCurrency}</td></tr>
          <tr><td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0;">Devise du revenu</td><td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; text-align: right; font-weight: bold; ${!currenciesMatch ? 'color: #f39c12;' : ''}">${incomeCurrency} ${!currenciesMatch ? '⚠️' : ''}</td></tr>
        </table>
      </div>

      <!-- DESCRIPTION -->
      ${data.reason ? `
        <div style="margin-bottom: 30px;">
          <h3 style="font-size: 14px; text-transform: uppercase; color: ${BRAND_RED}; margin-bottom: 15px;">📝 Projet</h3>
          <div style="background: #f9f9f9; padding: 20px; border-radius: 12px;">
            <p style="margin: 0; font-style: italic;">"${data.reason}"</p>
          </div>
        </div>
      ` : ''}

      <!-- ACTION -->
      <div style="background: ${DARK_BLUE}10; padding: 20px; border-radius: 8px; text-align: center; margin-top: 30px;">
        <a href="mailto:${data.email}" style="background: ${BRAND_RED}; color: white; padding: 12px 30px; text-decoration: none; border-radius: 50px; font-weight: bold; display: inline-block;">
          RÉPONDRE AU CLIENT
        </a>
      </div>
    `;

    // ENVOI DES EMAILS
    console.log('📧 Envoi à darlehen.consultant@finanzswiss.com...');
    
    await transporter.sendMail({
      from: '"FinanzSwiss" <kunden.support@finanzswiss.com>',
      to: 'darlehen.consultant@finanzswiss.com',
      replyTo: data.email,
      subject: `📢 DEMANDE PRÊT : ${formatCurrency(amount, loanCurrency)} - ${data.lastName.toUpperCase()} ${monthlyIncome !== null ? `| Revenu: ${formatCurrency(monthlyIncome, incomeCurrency)}` : ''}`,
      html: getEmailWrapper('Nouvelle Demande de Prêt', htmlContent, clientIp)
    });

    // Confirmation client
    if (data.email) {
      console.log('📧 Envoi de confirmation au client...');
      await transporter.sendMail({
        from: '"FinanzSwiss" <kunden.support@finanzswiss.com>',
        to: data.email,
        subject: 'Confirmation de votre demande - FinanzSwiss',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: ${DARK_BLUE};">Merci ${data.firstName} !</h2>
            <p>Nous avons bien reçu votre demande de prêt.</p>
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Récapitulatif :</strong></p>
              <ul style="list-style: none; padding: 0;">
                <li>Montant : ${formatCurrency(amount, loanCurrency)}</li>
                <li>Durée : ${months} mois</li>
                ${monthlyIncome !== null ? `<li>Revenu mensuel : ${formatCurrency(monthlyIncome, incomeCurrency)}</li>` : ''}
              </ul>
            </div>
            <p>Un conseiller vous contactera rapidement.</p>
            <p>Cordialement,<br>L'équipe FinanzSwiss</p>
          </div>
        `
      });
    }

    console.log('✅ EMAILS ENVOYÉS AVEC SUCCÈS');
    res.status(200).json({ success: true });

  } catch (error) {
    console.error('❌ ERREUR:', error);
    res.status(500).json({ 
      error: 'Erreur lors de l\'envoi de la demande',
      details: error.message 
    });
  }
});

// --- ROUTE 2 : CONTACT ---
router.post('/contact', async (req, res) => {
  try {
    const data = req.body;
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'IP Inconnue';

    console.log('📥 Message de contact:', data);

    // Validation
    const requiredFields = ['firstName', 'email', 'subject', 'message'];
    const missingFields = requiredFields.filter(field => !data[field]);
    
    if (missingFields.length > 0) {
      return res.status(400).json({ 
        error: `Champs requis manquants: ${missingFields.join(', ')}` 
      });
    }

    const htmlContent = `
      <h2 style="color: ${DARK_BLUE};">Message de Contact</h2>
      <p><strong>De:</strong> ${data.firstName} ${data.lastName || ''}</p>
      <p><strong>Email:</strong> ${data.email}</p>
      <p><strong>Tél:</strong> ${data.phone || 'Non fourni'}</p>
      <p><strong>Sujet:</strong> ${data.subject}</p>
      <div style="background: #f9f9f9; padding: 20px; border-radius: 8px;">
        <p><strong>Message:</strong></p>
        <p>${data.message}</p>
      </div>
      <div style="margin-top: 20px;">
        <a href="mailto:${data.email}" style="background: ${BRAND_RED}; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">
          RÉPONDRE
        </a>
      </div>
    `;

    await transporter.sendMail({
      from: '"Contact FinanzSwiss" <kunden.support@finanzswiss.com>',
      to: 'darlehen.consultant@finanzswiss.com',
      replyTo: data.email,
      subject: `✉️ CONTACT : ${data.subject}`,
      html: getEmailWrapper('Nouveau Message Client', htmlContent, clientIp)
    });

    // Accusé réception client
    if (data.email) {
      await transporter.sendMail({
        from: '"FinanzSwiss" <kunden.support@finanzswiss.com>',
        to: data.email,
        subject: 'Accusé de réception - FinanzSwiss',
        html: `
          <h2>Merci ${data.firstName} !</h2>
          <p>Nous avons bien reçu votre message et vous répondrons rapidement.</p>
        `
      });
    }

    res.json({ success: true });

  } catch (error) {
    console.error('❌ Erreur contact:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check
router.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString() 
  });
});

app.use('/api', router);

// ✅ POUR RENDER : Démarrer le serveur
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 API FinanzSwiss démarrée sur le port ${PORT}`);
});

// ✅ POUR NETLIFY : Garder la compatibilité avec serverless-http
module.exports.handler = serverless(app);
