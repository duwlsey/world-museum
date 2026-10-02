/**
 * World Museum recovery-email relay.
 * Deploy this project as a web app that executes as you and can be called by anyone.
 * Keep WM_MAILER_SECRET in Script Properties, never in the browser or a public repo.
 */
function doPost(e) {
  try {
    const payload = JSON.parse(e && e.postData && e.postData.contents ? e.postData.contents : '{}');
    const expectedSecret = PropertiesService.getScriptProperties().getProperty('WM_MAILER_SECRET');

    if (!expectedSecret || payload.secret !== expectedSecret) {
      return jsonOutput({ success: false, error: 'unauthorized' });
    }

    const recipient = String(payload.to || '').trim();
    const username = String(payload.username || '').trim().toLowerCase();
    const securityQuestion = String(payload.securityQuestion || '').trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
      return jsonOutput({ success: false, error: 'invalid_recipient' });
    }
    if (!/^[a-z0-9]{1,32}$/.test(username) || !securityQuestion || securityQuestion.length > 300) {
      return jsonOutput({ success: false, error: 'invalid_request' });
    }

    const subject = 'World Museum password reset request';
    const body = [
      'A student requested help resetting their World Museum password.',
      '',
      'Account ID: ' + username,
      'Selected security question: ' + securityQuestion,
      '',
      'No security answer was included. Please verify the request and reset the password manually within one hour.',
      'The temporary password should be the account ID. The student must change it after signing in.',
    ].join('\n');

    MailApp.sendEmail(recipient, subject, body, { name: 'World Museum' });
    return jsonOutput({ success: true });
  } catch (error) {
    console.error('World Museum mailer failed: ' + String(error));
    return jsonOutput({ success: false, error: 'send_failed' });
  }
}

function jsonOutput(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
