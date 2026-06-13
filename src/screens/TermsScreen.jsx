export default function TermsScreen({ onBack }) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#FBF7F4' }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid #F1E8E2', flexShrink: 0 }}>
        <div onClick={onBack} style={{ width: 36, height: 36, borderRadius: 11, background: '#F5F2EE', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7B7268" strokeWidth="2.2" strokeLinecap="round"><path d="m15 18-6-6 6-6"/></svg>
        </div>
        <h2 style={{ margin: 0, font: "600 20px 'Fredoka'", color: '#1F2933' }}>Terms of Service</h2>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px 40px' }} className="no-scrollbar">
        <p style={meta}>Last updated: June 2026</p>

        <P>By using <B>Let's Meet</B>, you agree to these Terms of Service. Please read them carefully.</P>

        <H>1. Acceptance of Terms</H>
        <P>By creating an account or using Let's Meet in any way, you agree to be bound by these terms. If you do not agree, do not use the app.</P>

        <H>2. Eligibility</H>
        <P>You must be at least <B>13 years old</B> to use Let's Meet. By using the app you confirm you meet this requirement. Users in the European Union must be at least 16.</P>

        <H>3. Your Account</H>
        <P>You are responsible for:</P>
        <UL items={[
          'Keeping your login credentials secure',
          'All activity that occurs under your account',
          'Providing accurate information when registering',
          'Notifying us immediately if you believe your account has been compromised',
        ]}/>

        <H>4. Acceptable Use</H>
        <P>You agree <B>not</B> to:</P>
        <UL items={[
          'Use the app to harass, threaten, or harm other users',
          'Create fake accounts or impersonate others',
          'Attempt to gain unauthorised access to other accounts or our systems',
          'Use the app for any illegal purpose',
          'Spam other users with unwanted invites or messages',
          'Reverse-engineer or copy any part of the app',
        ]}/>

        <H>5. User Content</H>
        <P>You own the content you create (plan names, etc.). By using Let's Meet, you grant us a limited licence to store and display your content to the people you choose to share it with. We do not claim ownership of your content.</P>

        <H>6. Plans & Invitations</H>
        <P>Let's Meet is a coordination tool. We are not responsible for whether plans actually take place, any costs incurred, or any disputes between users arising from plans made through the app.</P>

        <H>7. Account Termination</H>
        <P>We reserve the right to suspend or delete accounts that violate these terms, without prior notice. You may delete your account at any time from the <B>You</B> tab. Upon deletion, your data will be permanently removed within 30 days.</P>

        <H>8. Disclaimers</H>
        <P>Let's Meet is provided <B>"as is"</B> without warranties of any kind. We do not guarantee the app will be available at all times or free from errors. To the maximum extent permitted by law, we are not liable for any indirect, incidental, or consequential damages arising from your use of the app.</P>

        <H>9. Changes to Terms</H>
        <P>We may update these terms from time to time. We will notify you of significant changes through the app. Continued use after changes constitutes acceptance of the updated terms.</P>

        <H>10. Governing Law</H>
        <P>These terms are governed by applicable law. Any disputes will be resolved in the courts of the jurisdiction where the company is registered.</P>

        <H>11. Contact</H>
        <P>Questions about these terms? Email us at <B>legal@letsmeet.app</B></P>
      </div>
    </div>
  )
}

const body = { fontSize: 14, color: '#4A4540', lineHeight: 1.7, margin: '0 0 14px' }
const P  = ({ children }) => <p style={body}>{children}</p>
const B  = ({ children }) => <strong style={{ color: '#1F2933' }}>{children}</strong>
const H  = ({ children }) => <h3 style={{ margin: '22px 0 8px', font: "600 17px 'Fredoka'", color: '#1F2933' }}>{children}</h3>
const meta = { fontSize: 12.5, color: '#B6ADA4', margin: '0 0 20px' }
function UL({ items }) {
  return (
    <ul style={{ margin: '0 0 14px', paddingLeft: 18 }}>
      {items.map((t, i) => <li key={i} style={{ ...body, margin: '0 0 6px' }}>{t}</li>)}
    </ul>
  )
}
