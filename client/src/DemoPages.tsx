import { CalendarDays, CheckCircle2, ClipboardCheck, FileText, MapPin } from 'lucide-react'
import './DemoPages.css'

type DemoPageProps = { slug: 'welcome' | 'review' }

function WelcomePage() {
  return (
    <main className="demo-page demo-page--welcome">
      <header className="demo-header"><span className="demo-brand-mark">N</span><span>NORTHSTAR <small>MEMBER PORTAL</small></span><span className="demo-header-note">CUSTOMER CARE</span></header>
      <section className="demo-content">
        <div className="demo-eyebrow">WELCOME / 01</div>
        <h1>ご登録ありがとうございます</h1>
        <p className="demo-lead">アカウントの準備ができました。サービスをご利用いただく前に、登録内容をご確認ください。</p>
        <div className="demo-welcome-banner"><CheckCircle2 size={19} /><span><strong>登録が完了しました</strong><small>受付番号 NS-2048 · 2026年9月30日</small></span></div>
        <h2>これからの流れ</h2>
        <ol className="demo-timeline">
          <li><span>01</span><div><strong>登録内容を確認</strong><small>お名前と連絡先をご確認ください</small></div></li>
          <li><span>02</span><div><strong>利用開始の準備</strong><small>確認完了後、担当チームが準備します</small></div></li>
          <li><span>03</span><div><strong>ご案内をお届け</strong><small>登録されたメールアドレスにお送りします</small></div></li>
        </ol>
        <footer className="demo-footer">NORTHSTAR MEMBER SERVICES <span>·</span> SUPPORT DESK</footer>
      </section>
    </main>
  )
}

function ReviewPage() {
  return (
    <main className="demo-page demo-page--review">
      <header className="demo-header"><span className="demo-review-mark"><ClipboardCheck size={17} /></span><span>FIELDNOTE <small>ACCOUNT SERVICES</small></span><span className="demo-header-note">SECURE REVIEW</span></header>
      <section className="demo-content">
        <div className="demo-eyebrow">ACCOUNT / REVIEW</div>
        <h1>登録内容をご確認ください</h1>
        <p className="demo-lead">ご利用開始に向けて、以下の内容に誤りがないかご確認ください。</p>
        <div className="demo-review-status"><span className="demo-status-dot" />確認待ち <span>REQUEST FN-5812</span></div>
        <div className="demo-detail-list">
          <div><span><FileText size={14} />お申し込み</span><strong>チームプラン</strong></div>
          <div><span><MapPin size={14} />利用拠点</span><strong>東京オフィス</strong></div>
          <div><span><CalendarDays size={14} />利用開始日</span><strong>2026年10月15日</strong></div>
        </div>
        <div className="demo-review-note"><strong>確認事項</strong><p>内容に相違がある場合は、担当窓口までご連絡ください。確認後、次の手続きへ進みます。</p></div>
        <footer className="demo-footer">FIELDNOTE <span>·</span> ACCOUNT OPERATIONS</footer>
      </section>
    </main>
  )
}

export default function DemoPage({ slug }: DemoPageProps) {
  return slug === 'welcome' ? <WelcomePage /> : <ReviewPage />
}
