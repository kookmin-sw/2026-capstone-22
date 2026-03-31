import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from ..config import settings

logger = logging.getLogger(__name__)


def send_feedback_email(
    feedback_text: str,
    message_content: str,
    conversation_history: list[dict] | None = None,
    user_email: str | None = None,
):
    """Send feedback email via SMTP.

    Args:
        feedback_text: User's feedback text.
        message_content: The AI message content the feedback is about.
        conversation_history: Optional full conversation if user consented.
        user_email: Optional email of the user who sent feedback.
    """
    if (
        not settings.SMTP_USER
        or not settings.SMTP_PASSWORD
        or not settings.FEEDBACK_EMAIL
    ):
        raise RuntimeError("SMTP settings are not configured")

    subject = f"[ReadyTalk] 사용자 피드백"

    # Build conversation HTML
    conversation_html = ""
    if conversation_history:
        rows = []
        for msg in conversation_history:
            role = "사용자" if msg.get("role") == "user" else "AI"
            bg = "#2d3748" if msg.get("role") == "user" else "#1a1f2e"
            content = msg.get("content", "").replace("\n", "<br>")
            rows.append(
                f'<tr><td style="padding:8px;background:{bg};color:#e2e8f0;border-bottom:1px solid #4a5568;">'
                f"<strong>[{role}]</strong><br>{content}</td></tr>"
            )
        conversation_html = f"""
        <h3 style="color:#a78bfa;margin-top:24px;">전체 대화 내역</h3>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
            {''.join(rows)}
        </table>
        """

    html = f"""
    <div style="font-family:sans-serif;max-width:700px;margin:0 auto;background:#0f1724;padding:24px;border-radius:12px;color:#e2e8f0;">
        <h2 style="color:#a78bfa;border-bottom:2px solid #a78bfa;padding-bottom:8px;">사용자 피드백</h2>

        {f'<p><strong>보낸 사람:</strong> {user_email}</p>' if user_email else ''}

        <h3 style="color:#60a5fa;">피드백 내용</h3>
        <div style="background:#1e293b;padding:16px;border-radius:8px;border-left:4px solid #a78bfa;white-space:pre-wrap;">
            {feedback_text}
        </div>

        <h3 style="color:#60a5fa;margin-top:24px;">해당 AI 응답</h3>
        <div style="background:#1e293b;padding:16px;border-radius:8px;border-left:4px solid #60a5fa;white-space:pre-wrap;">
            {message_content[:3000]}
        </div>

        {conversation_html}

        <p style="color:#64748b;font-size:12px;margin-top:24px;text-align:center;">
            ReadyTalk Feedback System
        </p>
    </div>
    """

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.SMTP_USER
    msg["To"] = settings.FEEDBACK_EMAIL
    msg.attach(MIMEText(html, "html", "utf-8"))

    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
        server.starttls()
        server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        server.send_message(msg)

    logger.info("Feedback email sent successfully")
