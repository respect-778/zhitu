import './index.css'

const NotFound = () => {
  return (
    <div className='not-found-page'>
      <div className='container'>
        <header className="top-header">
        </header>

        <div>
          <div className="starsec"></div>
          <div className="starthird"></div>
          <div className="starfourth"></div>
          <div className="starfifth"></div>
        </div>

        <div className="lamp__wrap">
          <div className="lamp">
            <div className="cable"></div>
            <div className="cover"></div>
            <div className="in-cover">
              <div className="bulb"></div>
            </div>
            <div className="light"></div>
          </div>
        </div>
        <section className="error">
          <div className="error__content">
            <div className="error__message message">
              <h1 className="message__title">页面找不到</h1>
              <p className="message__text">很抱歉，您要查找的页面不在此处。您提供的链接跟随该链接可能已断开或不再存在。请重试，或查看我们的。</p>
            </div>
            <div className="error__nav e-nav">
              <a href="/" className="e-nav__link"></a>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

export default NotFound