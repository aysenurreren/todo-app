import nodemailer from "nodemailer";
import logger from "./logger.js";

// ── Gmail SMTP Bağlantısı ──────────────────────────────────────

//Email göndermek için kullanılan protokol. Tıpkı HTTP'nin web için olduğu gibi, SMTP email için kullanılır.

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS,
  },
});

// Bağlantıyı test et
//Uygulama başlarken Gmail'e bağlanabiliyor muyuz diye kontrol eder. Şifre yanlışsa ya da Gmail erişimi kapalıysa hata verir, sistem başlamadan önce haberdar oluruz.

transporter.verify((err) => {
  if (err) {
    logger.error(`[Mailer] Bağlantı hatası: ${err.message}`);
  } else {
    logger.info("[Mailer] Gmail SMTP bağlantısı hazır");
  }
});

// ── Doğrulama Kodu Gönder ──────────────────────────────────────
export const sendVerificationEmail = async (email, code) => {
  await transporter.sendMail({
    from: `"Görevlerim" <${process.env.GMAIL_USER}>`,
    to: email,
    subject: "Email Doğrulama Kodun",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 400px; margin: 0 auto;">
        <h2 style="color: #4F46E5;">Görevlerim</h2>
        <p>Hesabını doğrulamak için aşağıdaki kodu gir:</p>
        <div style="
          font-size: 32px;
          font-weight: bold;
          letter-spacing: 8px;
          color: #4F46E5;
          background: #EEF2FF;
          padding: 16px;
          text-align: center;
          border-radius: 8px;
          margin: 20px 0;
        ">${code}</div>
        <p style="color: #64748B; font-size: 13px;">
          Bu kod 10 dakika geçerlidir.<br/>
          Eğer bu işlemi sen yapmadıysan bu emaili görmezden gelebilirsin.
        </p>
      </div>
    `,
  });
};

// ── Şüpheli Giriş Uyarı Maili ─────────────────────────────────
export const sendLoginAlertEmail = async (email) => {
  await transporter.sendMail({
    from: `"Görevlerim" <${process.env.GMAIL_USER}>`,
    to: email,
    subject: "Hesabınıza Şüpheli Giriş Denemesi",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 400px; margin: 0 auto;">
        <h2 style="color: #DC2626;">⚠️ Güvenlik Uyarısı</h2>
        <p>Hesabınıza art arda <strong>5 başarısız giriş denemesi</strong> yapıldı.</p>
        <div style="
          background: #FEF2F2;
          border: 1px solid #FECACA;
          border-radius: 8px;
          padding: 16px;
          margin: 20px 0;
        ">
          <p style="color: #991B1B; margin: 0;">
            Eğer bu girişimleri siz yapmadıysanız hesabınız tehlikede olabilir.
            Lütfen şifrenizi hemen değiştirin.
          </p>
        </div>
        <p style="color: #64748B; font-size: 13px;">
          Hesabınız 15 dakika süreyle kilitlenmiştir.<br/>
          Bu girişimleri siz yaptıysanız bu emaili görmezden gelebilirsiniz.
        </p>
      </div>
    `,
  });
};

// ── Şifre Sıfırlama Maili ──────────────────────────────────────
export const sendPasswordResetEmail = async (email, token) => {
  const resetUrl = `http://localhost/reset-password?token=${token}`;

  await transporter.sendMail({
    from: `"Görevlerim" <${process.env.GMAIL_USER}>`,
    to: email,
    subject: "Şifre Sıfırlama Talebi",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 400px; margin: 0 auto;">
        <h2 style="color: #4F46E5;">Şifre Sıfırlama</h2>
        <p>Şifrenizi sıfırlamak için aşağıdaki butona tıklayın:</p>
        <a href="${resetUrl}" style="
          display: inline-block;
          background: #4F46E5;
          color: white;
          padding: 12px 24px;
          border-radius: 8px;
          text-decoration: none;
          margin: 20px 0;
          font-weight: bold;
        ">Şifremi Sıfırla</a>
        <p style="color: #64748B; font-size: 13px;">
          Bu link 1 saat geçerlidir.<br/>
          Eğer bu talebi siz yapmadıysanız bu emaili görmezden gelebilirsiniz.
        </p>
      </div>
    `,
  });
};

export default transporter;