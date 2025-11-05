// utils/sendEmail.js
const Brevo = require("@getbrevo/brevo");

const sendEmail = async (to, subject, text) => {
  try {
    const apiInstance = new Brevo.TransactionalEmailsApi();
    apiInstance.setApiKey(
      Brevo.TransactionalEmailsApiApiKeys.apiKey,
      process.env.BREVO_API_KEY
    );

    const emailData = {
      sender: {
        name: process.env.BREVO_FROM_NAME,
        email: process.env.BREVO_FROM_EMAIL,
      },
      to: [{ email: to }],
      subject: subject,
      htmlContent: `<p>${text}</p>`,
      textContent: text,
    };

    const data = await apiInstance.sendTransacEmail(emailData);
    console.log("✅ Email sent:");

  } catch (error) {
    console.log("❌ Brevo email failed");
    console.log("Message:", error.message);

    if (error.response && error.response.body) {
      console.log("➡️ Brevo Response Body:");
      console.log(JSON.stringify(error.response.body, null, 2));
    }
  }
};

module.exports = sendEmail;
