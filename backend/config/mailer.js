
const nodemailer = require("nodemailer");

const smtpPort = Number(process.env.SMTP_PORT || 587);

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: smtpPort,
  secure: smtpPort === 465,
  requireTLS: smtpPort === 587,

  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },

  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 15000,
});

async function sendPasswordResetOTP(email, otp) {
  return transporter.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to: email,
    subject: "TanishkWorld - Password Reset OTP",
    text: `Your TanishkWorld OTP is ${otp}. It expires in 10 minutes.`,
    html: `
      <div style="font-family:Arial;padding:24px;background:#10172b;color:white">
        <h2 style="color:#a78bfa">TanishkWorld</h2>
        <p>Your password reset verification code is:</p>
        <h1 style="color:#5eead4;letter-spacing:6px">${otp}</h1>
        <p>This OTP expires in 10 minutes.</p>
        <p>If you did not request this, ignore this email.</p>
      </div>
    `,
  });
}

module.exports = { sendPasswordResetOTP };
