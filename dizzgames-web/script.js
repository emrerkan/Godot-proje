/* ==========================================================================
   DizzGames × TacticalDark — Interactive Scripts
   ========================================================================== */

(() => {
  // 1. Ambient Cursor Flashlight Effect
  const flashlight = document.getElementById('flashlightCursor');
  if (flashlight) {
    window.addEventListener(
      'pointermove',
      (e) => {
        flashlight.style.setProperty('--mx', `${e.clientX}px`);
        flashlight.style.setProperty('--my', `${e.clientY}px`);
      },
      { passive: true }
    );
  }

  // 2. Interactive Flashlight on the Maze Visual Frame
  const mazeFrame = document.getElementById('mazeFrame');
  if (mazeFrame) {
    mazeFrame.addEventListener('pointermove', (e) => {
      const rect = mazeFrame.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      mazeFrame.style.setProperty('--fx', `${x.toFixed(1)}%`);
      mazeFrame.style.setProperty('--fy', `${y.toFixed(1)}%`);
    });
  }

  // 3. Navbar Scroll State & Mobile Toggle
  const navbar = document.getElementById('navbar');
  const navToggle = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');

  const onScroll = () => {
    if (!navbar) return;
    navbar.classList.toggle('is-scrolled', window.scrollY > 24);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      const open = navLinks.classList.toggle('is-open');
      navToggle.setAttribute('aria-expanded', String(open));
    });

    navLinks.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('is-open');
        navToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // 4. Interactive Operator Class Selector (Exact TacticalDark GDD stats)
  const operators = {
    tank: {
      name: 'TANK',
      role: 'ÖN HAT · KART TAŞIYICI',
      hp: 150,
      desc: 'Ağır plaka taşıyıcı yeleğiyle önden giren, ateşi üstüne çeken ve kartı güvenle kapıya taşıyan takımın duvarı.',
      weapon: 'Otomatik Tüfek · 30 Mermi · Orta Menzil',
      stats: { hp: 100, speed: 45, range: 60, fire: 75 },
    },
    visioner: {
      name: 'VISIONER',
      role: 'KEŞİF · ÖNCÜ GÖZ',
      hp: 100,
      desc: 'Dengeli teçhizatıyla koridorları ilk tarayan, yolu açan ve takımına güvenli geçiş hattı sağlayan öncü operatör.',
      weapon: 'Hızlı Otomatik Tüfek · 28 Mermi · Orta Menzil',
      stats: { hp: 67, speed: 70, range: 68, fire: 72 },
    },
    runner: {
      name: 'RUNNER',
      role: 'HIZLI SIZMA · YAKIN TEMAS',
      hp: 75,
      desc: 'Minimal teçhizatla en yüksek hıza ulaşan sızma uzmanı. Kartı kapıp karanlık köşelerden hızla izini kaybettirir.',
      weapon: 'Yüksek Atış Hızlı SMG · 40 Mermi · Kısa Menzil',
      stats: { hp: 50, speed: 100, range: 35, fire: 80 },
    },
    sniper: {
      name: 'SNIPER',
      role: 'UZUN MENZİL · KORİDOR KİLİDİ',
      hp: 80,
      desc: 'Uzun koridorları tek başına kilitleyen sabırlı keskin nişancı. 130 metre menzilde tek atışta 120 hasar verir.',
      weapon: 'Keskin Nişancı Tüfeği · Tek Mermi · 120 Hasar · 130 m',
      stats: { hp: 53, speed: 52, range: 100, fire: 98 },
    },
    medic: {
      name: 'MEDIC',
      role: 'DESTEK · TAKIMIN SİGORTASI',
      hp: 110,
      desc: 'İsabetli yarı otomatik silahı ve yüksek dayanıklılığıyla zorlu çatışmalarda ekibini ayakta tutan destek sınıfı.',
      weapon: 'Yarı Otomatik Tüfek · 7 Mermi · Yüksek İsabet',
      stats: { hp: 73, speed: 68, range: 72, fire: 65 },
    },
  };

  const tabs = document.querySelectorAll('.operator-tab');
  const opName = document.getElementById('opName');
  const opRole = document.getElementById('opRole');
  const opHpBadge = document.getElementById('opHpBadge');
  const opDesc = document.getElementById('opDesc');
  const opWeapon = document.getElementById('opWeapon');
  const statHpVal = document.getElementById('statHpVal');
  const statHpBar = document.getElementById('statHpBar');
  const statSpeedVal = document.getElementById('statSpeedVal');
  const statSpeedBar = document.getElementById('statSpeedBar');
  const statRangeVal = document.getElementById('statRangeVal');
  const statRangeBar = document.getElementById('statRangeBar');
  const statFireVal = document.getElementById('statFireVal');
  const statFireBar = document.getElementById('statFireBar');

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const key = tab.dataset.op;
      const data = operators[key];
      if (!data) return;

      tabs.forEach((t) => {
        t.classList.remove('is-active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('is-active');
      tab.setAttribute('aria-selected', 'true');

      opName.textContent = data.name;
      opRole.textContent = data.role;
      opHpBadge.textContent = `${data.hp} HP`;
      opDesc.textContent = data.desc;
      opWeapon.textContent = data.weapon;

      statHpVal.textContent = `${data.hp} / 150`;
      statHpBar.style.width = `${data.stats.hp}%`;

      statSpeedVal.textContent = `${data.stats.speed}%`;
      statSpeedBar.style.width = `${data.stats.speed}%`;

      statRangeVal.textContent = `${data.stats.range}%`;
      statRangeBar.style.width = `${data.stats.range}%`;

      statFireVal.textContent = `${data.stats.fire}%`;
      statFireBar.style.width = `${data.stats.fire}%`;
    });
  });

  // 5. Waitlist Form with Validation & LocalStorage Persistence
  const waitlistForm = document.getElementById('waitlistForm');
  const emailInput = document.getElementById('emailInput');
  const feedback = document.getElementById('waitlistFeedback');

  const savedEmail = localStorage.getItem('dizzgames_waitlist_email');
  if (savedEmail && feedback) {
    feedback.textContent = `✓ ${savedEmail} erken erişim listesinde kayıtlı.`;
    feedback.className = 'waitlist-feedback is-success';
  }

  if (waitlistForm && emailInput && feedback) {
    waitlistForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = emailInput.value.trim();
      const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

      if (!isValid) {
        feedback.textContent = 'Lütfen geçerli bir e-posta adresi girin.';
        feedback.className = 'waitlist-feedback is-error';
        emailInput.focus();
        return;
      }

      localStorage.setItem('dizzgames_waitlist_email', email);
      feedback.textContent = `✓ Harika! TacticalDark çıktığında ${email} adresine haber vereceğiz.`;
      feedback.className = 'waitlist-feedback is-success';
      emailInput.value = '';
    });
  }

  // 6. Scroll Reveal Observer
  const reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    reveals.forEach((el) => observer.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add('is-visible'));
  }
  // 7. Real In-Game Gallery Lightbox (supports both videos & images)
  const lightbox = document.getElementById('lightbox');
  const lightboxImg = document.getElementById('lightboxImg');
  const lightboxVideo = document.getElementById('lightboxVideo');
  const lightboxCaption = document.getElementById('lightboxCaption');
  const lightboxClose = document.getElementById('lightboxClose');

  const closeLightbox = () => {
    if (!lightbox) return;
    lightbox.classList.remove('is-open');
    lightbox.setAttribute('aria-hidden', 'true');
    if (lightboxVideo) {
      lightboxVideo.pause();
      lightboxVideo.removeAttribute('src');
      lightboxVideo.load();
    }
  };

  document.querySelectorAll('[data-lightbox-src]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!lightbox || !lightboxImg || !lightboxVideo || !lightboxCaption) return;
      lightboxVideo.classList.add('is-hidden');
      lightboxImg.classList.remove('is-hidden');
      lightboxImg.src = btn.dataset.lightboxSrc;
      lightboxImg.alt = btn.dataset.lightboxCaption || 'TacticalDark oyun içi görüntü';
      lightboxCaption.textContent = btn.dataset.lightboxCaption || '';
      lightbox.classList.add('is-open');
      lightbox.setAttribute('aria-hidden', 'false');
    });
  });

  document.querySelectorAll('[data-lightbox-video]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!lightbox || !lightboxImg || !lightboxVideo || !lightboxCaption) return;
      lightboxImg.classList.add('is-hidden');
      lightboxVideo.classList.remove('is-hidden');
      lightboxVideo.src = btn.dataset.lightboxVideo;
      lightboxVideo.currentTime = 0;
      lightboxVideo.play().catch(() => {});
      lightboxCaption.textContent = btn.dataset.lightboxCaption || '';
      lightbox.classList.add('is-open');
      lightbox.setAttribute('aria-hidden', 'false');
    });
  });

  if (lightboxClose) lightboxClose.addEventListener('click', closeLightbox);
  if (lightbox) {
    lightbox.addEventListener('click', (e) => {
      if (e.target === lightbox) closeLightbox();
    });
  }
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeLightbox();
  });
})();
