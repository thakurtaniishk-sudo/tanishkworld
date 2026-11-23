
require("dotenv").config();

const nodemailer = require("nodemailer");

const port = Number(process.env.SMTP_PORT || 587);

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port,
  secure: port === 465,
  requireTLS: port === 587,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 15000,
});

async function testEmail() {
  try {
    await transporter.verify();
    console.log("SMTP authentication successful!");

    const info = await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: process.env.SMTP_USER,
      subject: "TanishkWorld SMTP Test",
      text: "Congratulations! TanishkWorld email service is working.",
    });

    console.log("Email accepted by SMTP server!");
    console.log("Message ID:", info.messageId);
    console.log("Accepted recipients:", info.accepted);
    console.log("Rejected recipients:", info.rejected);
  } catch (error) {
    console.error("SMTP TEST FAILED");
    console.error("Code:", error.code);
    console.error("Message:", error.message);
  }
}
testEmail();
