export default function PrivacyPolicyScreen({ onBack }) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#FBF7F4' }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid #F1E8E2', flexShrink: 0 }}>
        <div onClick={onBack} style={{ width: 36, height: 36, borderRadius: 11, background: '#F5F2EE', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7B7268" strokeWidth="2.2" strokeLinecap="round"><path d="m15 18-6-6 6-6"/></svg>
        </div>
        <h2 style={{ margin: 0, font: "600 20px -apple-system", color: '#1F2933' }}>Privacy Policy</h2>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px 40px' }} className="no-scrollbar">
        <p style={meta}>Last updated: July 2026</p>

        <P>Welcome to <B>Let's Meet</B>. We take your privacy seriously. This policy explains what information we collect, how we use it, and your rights.</P>

        <H>1. Information We Collect</H>
        <P>When you create an account and use Let's Meet, we collect:</P>
        <UL items={[
          'Name, username, and email address you provide',
          'Profile information you choose to add',
          'Plans you create — title, place, date, and who you invite',
          'Friend connections and circle memberships',
          'Your approximate location — only when you use place search, and only to show nearby venues. We never store your location.',
          'Device information and IP address for security purposes',
        ]}/>

        <H>2. How We Use Your Information</H>
        <P>We use your information solely to operate the app:</P>
        <UL items={[
          'Show your plans, friends, and circles',
          'Let friends find you by username',
          'Send plan invites and RSVP notifications',
          'Improve the app and fix bugs',
          'Prevent fraud and abuse',
        ]}/>

        <H>3. Who We Share Your Information With</H>
        <P><B>We do not sell your personal data.</B> We share information only in these limited cases:</P>
        <UL items={[
          'With other users — only what you choose to share (name, username, plans you invite them to)',
          'With Supabase (our database and auth provider) — data is processed and stored securely in their EU infrastructure',
          'With Google (only when you use place search, to show nearby venues) — subject to Google\'s Privacy Policy',
          'If required by law or to protect the rights and safety of users',
        ]}/>

        <H>4. Data Retention</H>
        <P>We keep your data for as long as your account is active. When you delete your account, your personal data is permanently deleted within 30 days. Plans you created may remain in a de-identified form to preserve other users' history.</P>

        <H>5. Your Rights</H>
        <P>You have the right to:</P>
        <UL items={[
          'Access the personal data we hold about you',
          'Correct inaccurate data',
          'Delete your account and personal data — available in-app under You → Delete account',
          'Export your data — contact us at the email below',
          'Object to or restrict processing',
        ]}/>

        <H>6. Children</H>
        <P>Let's Meet is not intended for children under 13. We do not knowingly collect personal information from children under 13. If you believe a child has provided us data, please contact us immediately.</P>

        <H>7. Security</H>
        <P>We use industry-standard security measures including encrypted connections (TLS), hashed passwords, and row-level security policies. No method of transmission is 100% secure, but we take reasonable steps to protect your data.</P>

        <H>8. Changes to This Policy</H>
        <P>We may update this policy from time to time. We will notify you of significant changes via the app. Continued use after changes constitutes acceptance.</P>

        <H>9. Contact Us</H>
        <P>Questions or requests? Email us at <B>privacy@letsmeet.app</B></P>
      </div>
    </div>
  )
}

// ─── mini components ──────────────────────────────────────────────────────────
const body = { fontSize: 14, color: '#4A4540', lineHeight: 1.7, margin: '0 0 14px' }
const P  = ({ children }) => <p style={body}>{children}</p>
const B  = ({ children }) => <strong style={{ color: '#1F2933' }}>{children}</strong>
const H  = ({ children }) => <h3 style={{ margin: '22px 0 8px', font: "600 17px -apple-system", color: '#1F2933' }}>{children}</h3>
const meta = { fontSize: 12.5, color: '#B6ADA4', margin: '0 0 20px' }
function UL({ items }) {
  return (
    <ul style={{ margin: '0 0 14px', paddingLeft: 18 }}>
      {items.map((t, i) => <li key={i} style={{ ...body, margin: '0 0 6px' }}>{t}</li>)}
    </ul>
  )
}
