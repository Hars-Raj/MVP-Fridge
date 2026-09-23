(() => {
  const DATA = window.FridgeData;
  const SG_CENTER = [1.3521, 103.8198];
  const USER_FALLBACK = [1.293, 103.852];
  const KEY = 'fridge-sg-v1';

  const $ = (id) => document.getElementById(id);
  const panel = $('panel');
  const sheet = $('sheet');
  const modal = $('modal');
  const drawer = $('drawer');
  const listPane = $('list-pane');

  const store = {
    load() {
      try {
        return JSON.parse(localStorage.getItem(KEY)) || {};
      } catch {
        return {};
      }
    },
    save(patch) {
      const next = { ...this.load(), ...patch };
      localStorage.setItem(KEY, JSON.stringify(next));
      return next;
    },
  };

  const saved = store.load();
  const state = {
    tab: 'map',
    query: '',
    chips: [],
    sort: saved.sort || 'tiktok',
    filters: saved.filters || {
      neighbourhood: '',
      distance: '',
      stars: [],
      price: '',
      cuisine: '',
      venue: '',
      heat: '',
      instagram: '',
      openNow: false,
      dietary: [],
      promo: false,
      community: false,
    },
    hotzonesOn: false,
    selectedId: null,
    userHere: USER_FALLBACK,
    bookmarks: saved.bookmarks || {
      'Want to Try': [],
      'Date Night': [],
      'East Side': [],
      'Hawker Favourites': [],
    },
    customLists: saved.customLists || [],
    searchHistory: saved.searchHistory || [],
    lastSeen: saved.lastSeen || [],
    following: saved.following || ['f1'],
    social: saved.social || {},
    profile: saved.profile || {
      signedIn: false,
      name: '',
      bio: '',
      avatar: '',
      visibility: 'public',
      visitVisibility: 'public',
      dietary: [],
      budget: 'any',
      cuisines: [],
      areas: [],
      vibe: 'classic',
      theme: 'orange',
      density: 'comfortable',
    },
    crawl: saved.crawl || { name: '', stops: [] },
    bookings: saved.bookings || [],
    groups: DATA.groups.map((g) => ({ ...g })),
    ranked: [],
  };

  let map;
  let pinLayer;
  let hotLayer;
  let routeLayer;
  const markers = {};

  function persist() {
    store.save({
      bookmarks: state.bookmarks,
      customLists: state.customLists,
      searchHistory: state.searchHistory,
      lastSeen: state.lastSeen,
      following: state.following,
      social: state.social,
      profile: state.profile,
      crawl: state.crawl,
      bookings: state.bookings,
      filters: state.filters,
      sort: state.sort,
    });
  }

  function applyTheme() {
    const p = state.profile;
    document.documentElement.style.setProperty(
      '--orange',
      p.theme === 'terracotta' ? '#c2410c' : p.theme === 'citrus' ? '#f48c06' : '#e85d04',
    );
    document.body.style.setProperty('--drawer-h', p.density === 'compact' ? '180px' : '240px');
  }

  function haversine(a, b) {
    const toR = (d) => (d * Math.PI) / 180;
    const R = 6371;
    const dLat = toR(b[0] - a[0]);
    const dLng = toR(b[1] - a[1]);
    const s =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toR(a[0])) * Math.cos(toR(b[0])) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  }

  function isOpenNow(e) {
    const now = new Date();
    if (!e.openDays.includes(now.getDay())) return false;
    const hours = e.hours.split(',')[0];
    const m = hours.match(/(\d{2}):(\d{2})–(\d{2}):(\d{2})/);
    if (!m) return true;
    const start = Number(m[1]) * 60 + Number(m[2]);
    let end = Number(m[3]) * 60 + Number(m[4]);
    const cur = now.getHours() * 60 + now.getMinutes();
    if (end < start) return cur >= start || cur <= end;
    return cur >= start && cur <= end;
  }

  function bookmarkedIds() {
    return new Set(Object.values(state.bookmarks).flat().concat(state.customLists.flatMap((l) => l.ids)));
  }

  function isBookmarked(id) {
    return bookmarkedIds().has(id);
  }

  function interestText() {
    return `${state.query} ${state.chips.join(' ')} ${state.profile.cuisines.join(' ')} ${state.profile.dietary.join(' ')} ${state.profile.areas.join(' ')} ${state.profile.vibe}`.toLowerCase();
  }

  function matchScore(e) {
    const q = interestText();
    if (!q.trim()) return 0;
    const hay = [
      e.name,
      e.signatureDish,
      e.cuisine,
      e.neighbourhood,
      e.venueType,
      e.hawkerCentre || '',
      e.stallName || '',
      ...(e.dishes || []),
      ...(e.dietary || []),
      e.lateNight ? 'late-night supper' : '',
      e.whyWorthGoing,
    ]
      .join(' ')
      .toLowerCase();
    let s = 0;
    q.split(/[\s,]+/).filter(Boolean).forEach((w) => {
      if (hay.includes(w)) s += 8;
    });
    if (q.includes('halal') && e.dietary.includes('halal')) s += 18;
    if (q.includes('muslim') && e.dietary.includes('muslim-friendly')) s += 14;
    if (q.includes('hawker') && e.venueType === 'hawker') s += 16;
    if (q.includes('hidden') && !e.viral) s += 10;
    if (q.includes('omakase') && hay.includes('omakase')) s += 20;
    if (q.includes('kaya') && hay.includes('kaya')) s += 20;
    if (q.includes('spicy') && hay.includes('spicy')) s += 12;
    if (q.includes('budget') && e.pricePerPerson <= 15) s += 12;
    if (q.includes('dessert') && (e.cuisine === 'Desserts' || hay.includes('dessert'))) s += 14;
    if (state.profile.vibe === 'viral' && e.viral) s += 8;
    if (state.profile.vibe === 'hidden' && !e.viral && e.worthGoing >= 2) s += 10;
    if (state.profile.vibe === 'classic' && e.tiktokRecency === 'classic') s += 8;
    if (state.profile.areas.length && state.profile.areas.includes(e.neighbourhood)) s += 10;
    if (state.profile.budget === 'budget' && e.pricePerPerson <= 15) s += 8;
    if (state.profile.budget === 'mid' && e.pricePerPerson > 15 && e.pricePerPerson < 60) s += 6;
    if (state.profile.budget === 'splurge' && e.pricePerPerson >= 60) s += 8;
    return s;
  }

  function rankScore(e) {
    const dist = haversine(state.userHere, [e.lat, e.lng]);
    const recencyBoost = e.tiktokRecency === 'this-week' ? 18 : e.tiktokRecency === 'newly-viral' ? 16 : e.tiktokRecency === 'recent' ? 8 : 2;
    const overhype = e.overhyped ? 12 : 0;
    const match = matchScore(e);
    if (state.sort === 'rating') return e.worthGoing * 40 + match - overhype;
    if (state.sort === 'location') return 80 - dist * 6 + match;
    if (state.sort === 'affordability') return 80 - e.pricePerPerson * 0.4 + match;
    if (state.sort === 'instagram') return e.instagramPopularity * 0.7 + match;
    if (state.sort === 'community') return e.communityScore * 12 + match;
    return e.tiktokHeat * 0.5 + recencyBoost + e.instagramPopularity * 0.18 + e.worthGoing * 10 + match - overhype - dist * 1.2;
  }

  function passesFilters(e) {
    const f = state.filters;
    if (f.neighbourhood && e.neighbourhood !== f.neighbourhood) return false;
    if (f.distance) {
      const km = Number(f.distance);
      if (haversine(state.userHere, [e.lat, e.lng]) > km) return false;
    }
    if (f.stars.length && !f.stars.includes(String(e.worthGoing))) return false;
    if (f.price === 'budget' && e.pricePerPerson > 15) return false;
    if (f.price === 'mid' && (e.pricePerPerson <= 15 || e.pricePerPerson > 45)) return false;
    if (f.price === 'splurge' && e.pricePerPerson <= 45) return false;
    if (f.cuisine && e.cuisine !== f.cuisine && !(e.dishes || []).includes(f.cuisine.toLowerCase())) return false;
    if (f.venue && e.venueType !== f.venue) return false;
    if (f.heat === 'high' && e.tiktokHeat < 70) return false;
    if (f.heat === 'week' && e.tiktokRecency !== 'this-week' && e.tiktokRecency !== 'newly-viral') return false;
    if (f.instagram === 'high' && e.instagramPopularity < 70) return false;
    if (f.openNow && !isOpenNow(e)) return false;
    if (f.dietary.length && !f.dietary.every((d) => e.dietary.includes(d) || (d === 'vegetarian' && e.dietary.includes('vegetarian-options')))) {
      if (f.dietary.includes('vegetarian') && e.dietary.includes('vegetarian-options')) {
        /* ok */
      } else if (!f.dietary.every((d) => e.dietary.includes(d))) return false;
    }
    if (f.promo && !e.hasPromo) return false;
    if (f.community) {
      const visited = DATA.visits.some((v) => v.eateryId === e.id);
      if (!visited) return false;
    }
    const chips = state.chips;
    if (chips.includes('Hawker Food') && e.venueType !== 'hawker') return false;
    if (chips.includes('Halal') && !e.dietary.includes('halal')) return false;
    if (chips.includes('Muslim-Friendly') && !e.dietary.includes('muslim-friendly') && !e.dietary.includes('halal')) return false;
    if (chips.includes('Café') && e.venueType !== 'cafe') return false;
    if (chips.includes('Late-Night') && !e.lateNight) return false;
    if (chips.includes('Fine Dining') && e.venueType !== 'fine-dining') return false;
    if (chips.includes('Budget Eats') && e.pricePerPerson > 15) return false;
    if (chips.includes('Vegetarian') && !e.dietary.includes('vegetarian') && !e.dietary.includes('vegetarian-options')) return false;
    if (chips.includes('Desserts') && e.cuisine !== 'Desserts' && !(e.dishes || []).some((d) => /dessert|toast|sago|soft serve/i.test(d))) return false;
    if (chips.includes('Seafood') && e.cuisine !== 'Seafood' && !(e.dishes || []).some((d) => /seafood|crab|prawn|stingray/i.test(d))) return false;
    const cuisines = ['Korean', 'Japanese', 'Chinese', 'Malay', 'Indian', 'Western'];
    const cuisineChip = cuisines.find((c) => chips.includes(c));
    if (cuisineChip && e.cuisine !== cuisineChip && e.cuisine !== `${cuisineChip}-Muslim` && !e.cuisine.includes(cuisineChip)) return false;
    return true;
  }

  function visibleEateries() {
    return DATA.eateries.filter(passesFilters).sort((a, b) => rankScore(b) - rankScore(a));
  }

  function starsHtml(n, grey) {
    const filled = '★'.repeat(n) + '☆'.repeat(3 - n);
    return `<span class="stars ${grey && n === 1 ? 'grey' : ''}" title="${n} star Worth Going">${filled}</span>`;
  }

  function recencyLabel(e) {
    if (e.tiktokRecency === 'this-week') return 'Trending this week';
    if (e.tiktokRecency === 'newly-viral') return 'Newly viral';
    if (e.tiktokRecency === 'recent') return 'Recently buzzing';
    return 'Long-standing classic';
  }

  function pinClass(e) {
    const tone = e.worthGoing === 3 ? 'gold' : e.worthGoing === 2 ? 'half' : 'grey';
    const heat = e.tiktokRecency === 'this-week' || e.tiktokRecency === 'newly-viral' ? 'heat-this-week' : '';
    const bm = isBookmarked(e.id) ? 'bookmarked' : '';
    return `pin ${tone} ${heat} ${bm}`;
  }

  function pinFoodIcon(e) {
    const details = [e.name, e.signatureDish, e.cuisine, ...(e.dishes || [])].join(' ').toLowerCase();
    if (/dessert|cake|gelato|ice cream|soft serve|sago|pastry/.test(details)) return '🍰';
    if (/coffee|café|cafe|kopi|espresso|roaster/.test(details)) return '☕';
    if (/sushi|sashimi|omakase|nigiri/.test(details)) return '🍣';
    if (/seafood|crab|prawn|shrimp|oyster|stingray|fish head|fish soup/.test(details)) return '🦐';
    if (/noodle|ramen|laksa|mee|pasta|bee hoon/.test(details)) return '🍜';
    if (/satay|barbecue|bbq|grill|yakitori/.test(details)) return '🍢';
    if (/chicken rice|roast chicken|fried chicken/.test(details)) return '🍗';
    if (/biryani|curry|nasi padang|nasi lemak|murtabak|thosai|thali/.test(details)) return '🍛';
    if (/soup|porridge|bak kut teh|stew/.test(details)) return '🍲';
    if (/japanese/.test(details)) return '🍣';
    if (/korean/.test(details)) return '🥢';
    if (/indian|malay/.test(details)) return '🍛';
    if (/chinese/.test(details)) return '🥢';
    if (e.venueType === 'hawker') return '🍜';
    return '🍽️';
  }

  function byId(id) {
    return DATA.eateries.find((e) => e.id === id);
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[char]);
  }

  function rememberSeen(id) {
    state.lastSeen = [id, ...state.lastSeen.filter((x) => x !== id)].slice(0, 12);
    persist();
  }

  function toggleBookmark(id, listName = 'Want to Try') {
    if (!state.profile.signedIn) {
      openAccount(true);
      return;
    }
    const lists = state.bookmarks;
    const already = Object.keys(lists).some((k) => lists[k].includes(id));
    if (already) {
      Object.keys(lists).forEach((k) => {
        lists[k] = lists[k].filter((x) => x !== id);
      });
      state.customLists.forEach((l) => {
        l.ids = l.ids.filter((x) => x !== id);
      });
    } else {
      lists[listName] = lists[listName] || [];
      lists[listName].push(id);
    }
    persist();
    renderPins();
    if (state.selectedId === id) openCard(id);
  }

  function cardHtml(e, compact) {
    const km = haversine(state.userHere, [e.lat, e.lng]).toFixed(1);
    return `
      <button type="button" class="food-card" data-open="${e.id}">
        <img src="${e.photo}" alt="${e.name}" />
        <div class="body">
          <div class="row">
            ${starsHtml(e.worthGoing, true)}
            ${e.tiktokLed ? '<span class="badge tt">TikTok</span>' : ''}
            ${e.viral ? '<span class="badge warn">Viral</span>' : ''}
            ${e.venueType === 'hawker' ? '<span class="badge teal">Hawker</span>' : ''}
          </div>
          <h3>${e.name}</h3>
          <p class="muted">${e.signatureDish} · ${e.neighbourhood} · ${km} km</p>
          ${compact ? '' : `<p class="muted">${e.whyWorthGoing}</p>`}
          <div class="heat ${e.tiktokRecency === 'classic' ? 'classic' : ''}" title="TikTok Heat (demo)"><span style="width:${e.tiktokHeat}%"></span></div>
          <p class="muted">${recencyLabel(e)} · Heat ${e.tiktokHeat}/100 · demo</p>
        </div>
      </button>`;
  }

  function renderChips() {
    $('chips').innerHTML = DATA.chips
      .map(
        (c) =>
          `<button type="button" class="chip ${state.chips.includes(c) ? 'is-on' : ''}" data-chip="${c}">${c}</button>`,
      )
      .join('');
  }

  function renderTrending() {
    const list = visibleEateries().slice(0, 8);
    state.ranked = list;
    $('trending-carousel').innerHTML = list.map((e) => cardHtml(e, true)).join('') || '<p class="muted">No matches. Clear filters.</p>';
    $('drawer-title').textContent = state.query || state.chips.length ? 'Personalised for you' : 'Trending near you';
    if (window.matchMedia('(min-width: 960px)').matches && state.tab === 'map') {
      document.body.classList.add('split');
      listPane.hidden = false;
      listPane.innerHTML = `
        <p class="kicker">Map / list · TikTok-first ranking</p>
        <h2>Worth going nearby</h2>
        <p class="muted">Google Reviews are not the primary signal. Social figures are demo data.</p>
        <label class="field">Prioritise
          <select id="sort-desk">
            <option value="tiktok">TikTok Heat</option>
            <option value="rating">Worth Going rating</option>
            <option value="location">Distance</option>
            <option value="affordability">Affordability</option>
            <option value="instagram">Instagram popularity</option>
            <option value="community">Fellow foodies</option>
          </select>
        </label>
        <div class="grid">${visibleEateries().map((e) => cardHtml(e, true)).join('')}</div>`;
      const sel = $('sort-desk');
      if (sel) {
        sel.value = state.sort;
        sel.onchange = () => {
          state.sort = sel.value;
          persist();
          refresh();
        };
      }
    } else if (state.tab !== 'map') {
      document.body.classList.remove('split');
      listPane.hidden = true;
    }
  }

  function renderPins() {
    pinLayer.clearLayers();
    visibleEateries().forEach((e) => {
      const icon = L.divIcon({
        className: '',
        html: `<div class="${pinClass(e)}" aria-hidden="true"><span class="food-icon">${pinFoodIcon(e)}</span>${e.tiktokLed ? '<span class="tt-dot">T</span>' : ''}</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 28],
      });
      const m = L.marker([e.lat, e.lng], { icon, title: `${e.name} · ${pinFoodIcon(e)}` });
      m.on('click', () => openCard(e.id));
      m.addTo(pinLayer);
      markers[e.id] = m;
    });
    renderRoute();
  }

  function renderHotzones() {
    hotLayer.clearLayers();
    if (!state.hotzonesOn) return;
    DATA.hotzones.forEach((z) => {
      const color = z.label === 'Newly viral' ? '#d00000' : z.label === 'Trending this week' ? '#e85d04' : '#0f6e6b';
      L.circle([z.lat, z.lng], {
        radius: z.radius,
        color,
        fillColor: color,
        fillOpacity: 0.18,
        weight: 2,
      })
        .on('click', () => openHotzone(z))
        .addTo(hotLayer);
      L.marker([z.lat, z.lng], {
        icon: L.divIcon({ className: 'hotzone-label', html: `${z.name} · ${z.label}` }),
      })
        .on('click', () => openHotzone(z))
        .addTo(hotLayer);
    });
  }

  function renderRoute() {
    if (routeLayer) map.removeLayer(routeLayer);
    const stops = state.crawl.stops.map(byId).filter(Boolean);
    if (stops.length < 2 || state.tab !== 'map') return;
    routeLayer = L.polyline(
      stops.map((s) => [s.lat, s.lng]),
      { color: '#e85d04', weight: 4, dashArray: '8 8' },
    ).addTo(map);
  }

  function openHotzone(z) {
    const places = z.eateryIds.map(byId).filter(Boolean);
    sheet.hidden = false;
    sheet.innerHTML = `
      <div class="content">
        <p class="kicker">${z.label}</p>
        <h1>${z.name} hotzone</h1>
        <p>${z.why}</p>
        <p class="muted">Area activity is demo data for this week.</p>
        <div class="grid">${places.map((e) => cardHtml(e)).join('')}</div>
        <button type="button" class="secondary" data-close-sheet>Close</button>
      </div>`;
    bindSheet();
  }

  function openCard(id) {
    const e = byId(id);
    if (!e) return;
    state.selectedId = id;
    rememberSeen(id);
    map.panTo([e.lat, e.lng]);
    sheet.hidden = false;
    const bm = isBookmarked(id);
    sheet.innerHTML = `
      <div class="hero"><img src="${e.photo}" alt=""></div>
      <div class="content">
        <div class="row">
          ${starsHtml(e.worthGoing, true)}
          ${e.tiktokLed ? '<span class="badge tt">TikTok-led</span>' : ''}
          ${e.viral ? '<span class="badge warn">Viral ≠ automatically worth it</span>' : ''}
          <span class="badge demo">Demo social data</span>
        </div>
        <h1>${e.name}</h1>
        ${e.hawkerCentre ? `<p class="muted">Stall ${e.stallName || e.name} · ${e.hawkerCentre}</p>` : ''}
        <p><strong>${e.signatureDish}</strong> · ${e.cuisine} · ${e.priceLabel} / person</p>
        <p class="muted">${e.address}<br>${e.hours} ${isOpenNow(e) ? '· Open now (est.)' : ''}</p>
        <div class="badge-row">
          ${(e.dietary || []).map((d) => `<span class="badge teal">${d}</span>`).join('')}
          <span class="badge">${e.venueType}</span>
          <span class="badge ig">Instagram</span>
        </div>
        <p class="kicker" style="margin-top:12px">TikTok Heat · ${recencyLabel(e)}</p>
        <div class="heat ${e.tiktokRecency === 'classic' ? 'classic' : ''}"><span style="width:${e.tiktokHeat}%"></span></div>
        <p class="muted">${e.tiktokActivity}<br>${e.instagramActivity}<br>Creators: ${e.creators.join(', ')}</p>
        <p><strong>Why people are going:</strong> ${e.whyTrending}</p>
        <p><strong>Why it’s worth going:</strong> ${e.whyWorthGoing}</p>
        <p class="muted">${e.sentiment}</p>
        <div class="row" style="margin-top:12px">
          <button type="button" class="primary" data-details="${e.id}">Full details</button>
          <button type="button" class="secondary" data-bookmark="${e.id}">${bm ? 'Bookmarked' : 'Bookmark'}</button>
          <button type="button" class="secondary" data-add-crawl="${e.id}">Add to crawl</button>
          <button type="button" class="secondary" data-share="${e.id}">Share place</button>
          <button type="button" class="secondary" data-book="${e.id}">Reserve</button>
          <a class="secondary" style="text-decoration:none" href="https://www.google.com/maps/dir/?api=1&destination=${e.lat},${e.lng}" target="_blank" rel="noreferrer">Directions</a>
        </div>
        <button type="button" class="text-btn" data-close-sheet>Close</button>
      </div>`;
    bindSheet();
  }

  function openDetails(id) {
    const e = byId(id);
    showTab('news');
    panel.hidden = false;
    panel.innerHTML = `
      <p class="kicker">Eatery details</p>
      <h2>${e.name}</h2>
      <img src="${e.photo}" alt="" style="width:min(720px,100%);height:280px;object-fit:cover;border-radius:18px">
      ${e.hawkerCentre ? `<p>Hawker centre: <strong>${e.hawkerCentre}</strong> · Stall: ${e.stallName}</p>` : ''}
      <p>Neighbourhood: ${e.neighbourhood} · ${e.address}</p>
      <p>Hours: ${e.hours} · Est. ${e.priceLabel}</p>
      <p>${starsHtml(e.worthGoing)} Worth Going · Community ${e.communityScore}/5 (demo)</p>
      <h3>About this rating</h3>
      <p>TikTok is the top ranking signal, Instagram is second. A place can be very viral and still score 1–2 stars when queues, inconsistency, or overhype show up in social sentiment. Scores mix current buzz with perceived value. Popularity moves quickly; treat this as a snapshot, not a live verified metric.</p>
      <p><strong>Why it’s trending:</strong> ${e.whyTrending}</p>
      <p><strong>Why it’s worth going:</strong> ${e.whyWorthGoing}</p>
      <div class="row">
        <button class="primary" data-bookmark="${e.id}">${isBookmarked(e.id) ? 'Bookmarked' : 'Bookmark'}</button>
        <button class="secondary" data-add-crawl="${e.id}">Add to food crawl</button>
        <button class="secondary" data-share="${e.id}">Share place</button>
        <button class="secondary" data-book="${e.id}">Request a table</button>
        <button class="secondary" data-tab="map">Back to map</button>
      </div>`;
    panel.querySelector('[data-bookmark]').onclick = (ev) => toggleBookmark(ev.currentTarget.dataset.bookmark);
    panel.querySelector('[data-add-crawl]').onclick = (ev) => addToCrawl(ev.currentTarget.dataset.addCrawl);
    panel.querySelector('[data-book]').onclick = (ev) => openBooking(ev.currentTarget.dataset.book);
    panel.querySelector('[data-share]').onclick = (ev) => sharePlace(ev.currentTarget.dataset.share);
    panel.querySelector('[data-tab="map"]').onclick = () => showTab('map');
  }

  function bindSheet() {
    sheet.querySelectorAll('[data-open]').forEach((b) => (b.onclick = () => openCard(b.dataset.open)));
    sheet.querySelectorAll('[data-details]').forEach((b) => (b.onclick = () => openDetails(b.dataset.details)));
    sheet.querySelectorAll('[data-bookmark]').forEach((b) => (b.onclick = () => toggleBookmark(b.dataset.bookmark)));
    sheet.querySelectorAll('[data-add-crawl]').forEach((b) => (b.onclick = () => addToCrawl(b.dataset.addCrawl)));
    sheet.querySelectorAll('[data-book]').forEach((b) => (b.onclick = () => openBooking(b.dataset.book)));
    sheet.querySelectorAll('[data-share]').forEach((b) => (b.onclick = () => sharePlace(b.dataset.share)));
    sheet.querySelectorAll('[data-close-sheet]').forEach((b) => (b.onclick = () => (sheet.hidden = true)));
  }

  function addToCrawl(id) {
    if (state.crawl.stops.includes(id)) return;
    if (state.crawl.stops.length >= 4) {
      toast('A crawl can have 2–4 stops. Remove one first.');
      openCrawl();
      return;
    }
    state.crawl.stops.push(id);
    persist();
    openCrawl();
    renderRoute();
  }

  function toast(msg) {
    const notice = $('toast');
    notice.textContent = msg;
    notice.hidden = false;
    window.clearTimeout(toast.timer);
    toast.timer = window.setTimeout(() => (notice.hidden = true), 2800);
  }

  async function sharePlace(id) {
    const url = new URL(location.href);
    url.hash = `place=${encodeURIComponent(id)}`;
    try {
      await navigator.clipboard.writeText(url.href);
      toast('Place link copied.');
    } catch {
      toast(url.href);
    }
  }

  function crawlLegs() {
    const stops = state.crawl.stops.map(byId).filter(Boolean);
    const legs = [];
    for (let i = 0; i < stops.length - 1; i += 1) {
      const km = haversine([stops[i].lat, stops[i].lng], [stops[i + 1].lat, stops[i + 1].lng]);
      const mins = Math.max(6, Math.round((km / 4.2) * 60));
      legs.push({ from: stops[i].name, to: stops[i + 1].name, km: km.toFixed(2), mins });
    }
    return { stops, legs };
  }

  function openCrawl() {
    showTab('map');
    const { stops, legs } = crawlLegs();
    sheet.hidden = false;
    sheet.innerHTML = `
      <div class="content">
        <p class="kicker">Food crawl</p>
        <h1>Plan my food crawl</h1>
        <p class="muted">Pick 2–4 nearby eateries, including bookmarks. Distances are walking estimates.</p>
        <label class="field">Route name
          <input id="crawl-name" value="${state.crawl.name || ''}" placeholder="East Side kaya hop">
        </label>
        <div class="grid">
          ${stops
            .map(
              (s, i) => `
            <div class="news-card row" style="justify-content:space-between">
              <div><strong>${i + 1}. ${s.name}</strong><div class="muted">${s.neighbourhood}</div></div>
              <div class="row">
                <button class="secondary" data-up="${i}">Up</button>
                <button class="secondary" data-down="${i}">Down</button>
                <button class="secondary" data-rm="${s.id}">Remove</button>
              </div>
            </div>`,
            )
            .join('')}
        </div>
        ${legs.map((l) => `<p class="muted">${l.from} → ${l.to}: ~${l.km} km · ~${l.mins} min walk</p>`).join('')}
        <p class="muted">${stops.length < 2 ? 'Add at least two stops from the map or bookmarks.' : ''}</p>
        <div class="row">
          <button class="primary" id="save-crawl">Save route</button>
          <button class="secondary" data-close-sheet>Done</button>
        </div>
        <h3>Bookmarks you can add</h3>
        <div class="grid">${[...bookmarkedIds()].map(byId).filter(Boolean).map((e) => `<button class="secondary" data-add-crawl="${e.id}">+ ${e.name}</button>`).join('') || '<p class="muted">No bookmarks yet.</p>'}</div>
      </div>`;
    bindSheet();
    sheet.querySelectorAll('[data-up]').forEach((b) => {
      b.onclick = () => {
        const i = Number(b.dataset.up);
        if (i === 0) return;
        const arr = state.crawl.stops;
        [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
        persist();
        openCrawl();
      };
    });
    sheet.querySelectorAll('[data-down]').forEach((b) => {
      b.onclick = () => {
        const i = Number(b.dataset.down);
        const arr = state.crawl.stops;
        if (i >= arr.length - 1) return;
        [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]];
        persist();
        openCrawl();
      };
    });
    sheet.querySelectorAll('[data-rm]').forEach((b) => {
      b.onclick = () => {
        state.crawl.stops = state.crawl.stops.filter((x) => x !== b.dataset.rm);
        persist();
        openCrawl();
      };
    });
    $('save-crawl').onclick = () => {
      state.crawl.name = $('crawl-name').value;
      persist();
      toast('Route saved on this device.');
      renderRoute();
    };
  }

  function openBooking(id) {
    const e = byId(id);
    modal.hidden = false;
    modal.innerHTML = `
      <div class="box">
        <p class="kicker">Demo reservation</p>
        <h2>Book ${e.name}</h2>
        <p class="muted">This does not contact the restaurant. A future partner API can replace this form.</p>
        <label class="field">Date <input type="date" id="bk-date"></label>
        <label class="field">Time <input type="time" id="bk-time" value="19:00"></label>
        <label class="field">Pax <input type="number" id="bk-pax" min="1" max="12" value="2"></label>
        <label class="field">Notes <textarea id="bk-notes" placeholder="Window seat, high chair…"></textarea></label>
        <div class="row">
          <button class="primary" id="bk-send">Send request</button>
          <button class="secondary" id="bk-cancel">Cancel</button>
        </div>
      </div>`;
    $('bk-cancel').onclick = () => (modal.hidden = true);
    $('bk-send').onclick = () => {
      state.bookings.push({
        eateryId: id,
        date: $('bk-date').value,
        time: $('bk-time').value,
        pax: $('bk-pax').value,
        notes: $('bk-notes').value,
      });
      persist();
      modal.hidden = true;
      toast('Demo booking saved to your profile. The restaurant has not been notified.');
    };
  }

  function openFilters() {
    const f = state.filters;
    const areas = [...new Set(DATA.eateries.map((e) => e.neighbourhood))].sort();
    const cuisines = [...new Set(DATA.eateries.map((e) => e.cuisine))].sort();
    modal.hidden = false;
    modal.innerHTML = `
      <div class="box">
        <h2>Filters</h2>
        <div class="filter-grid">
          <label class="field">Neighbourhood
            <select id="f-n"><option value="">Anywhere</option>${areas.map((a) => `<option ${f.neighbourhood === a ? 'selected' : ''}>${a}</option>`).join('')}</select>
          </label>
          <label class="field">Distance
            <select id="f-d">
              <option value="">Any</option>
              <option value="2" ${f.distance === '2' ? 'selected' : ''}>Under 2 km</option>
              <option value="5" ${f.distance === '5' ? 'selected' : ''}>Under 5 km</option>
              <option value="10" ${f.distance === '10' ? 'selected' : ''}>Under 10 km</option>
            </select>
          </label>
          <label class="field">Worth Going
            <select id="f-s" multiple size="3">
              <option value="3" ${f.stars.includes('3') ? 'selected' : ''}>3 gold</option>
              <option value="2" ${f.stars.includes('2') ? 'selected' : ''}>2 half-gold</option>
              <option value="1" ${f.stars.includes('1') ? 'selected' : ''}>1 grey</option>
            </select>
          </label>
          <label class="field">Affordability
            <select id="f-p">
              <option value="">Any</option>
              <option value="budget" ${f.price === 'budget' ? 'selected' : ''}>Budget ≤ $15</option>
              <option value="mid" ${f.price === 'mid' ? 'selected' : ''}>$16–45</option>
              <option value="splurge" ${f.price === 'splurge' ? 'selected' : ''}>$45+</option>
            </select>
          </label>
          <label class="field">Cuisine
            <select id="f-c"><option value="">Any</option>${cuisines.map((c) => `<option ${f.cuisine === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
          </label>
          <label class="field">Venue
            <select id="f-v">
              <option value="">Any</option>
              ${['hawker', 'cafe', 'restaurant', 'bar', 'fine-dining'].map((v) => `<option value="${v}" ${f.venue === v ? 'selected' : ''}>${v}</option>`).join('')}
            </select>
          </label>
          <label class="field">TikTok Heat
            <select id="f-h">
              <option value="">Any</option>
              <option value="high" ${f.heat === 'high' ? 'selected' : ''}>High heat</option>
              <option value="week" ${f.heat === 'week' ? 'selected' : ''}>This week / newly viral</option>
            </select>
          </label>
          <label class="field">Instagram
            <select id="f-i">
              <option value="">Any</option>
              <option value="high" ${f.instagram === 'high' ? 'selected' : ''}>High popularity</option>
            </select>
          </label>
        </div>
        <label class="field"><input type="checkbox" id="f-open" ${f.openNow ? 'checked' : ''}> Open now (estimated from listed hours)</label>
        <label class="field"><input type="checkbox" id="f-promo" ${f.promo ? 'checked' : ''}> Has a demo promotion / 2-for-1</label>
        <label class="field"><input type="checkbox" id="f-com" ${f.community ? 'checked' : ''}> Visited by fellow foodies</label>
        <p>Dietary</p>
        ${['halal', 'muslim-friendly', 'vegetarian'].map((d) => `<label class="field"><input type="checkbox" class="f-diet" value="${d}" ${f.dietary.includes(d) ? 'checked' : ''}> ${d}</label>`).join('')}
        <label class="field"><input type="checkbox" id="f-late" ${state.chips.includes('Late-Night') ? 'checked' : ''}> Late-night food</label>
        <div class="row">
          <button class="primary" id="f-apply">Apply</button>
          <button class="secondary" id="f-clear">Clear</button>
        </div>
      </div>`;
    $('f-clear').onclick = () => {
      state.filters = {
        neighbourhood: '',
        distance: '',
        stars: [],
        price: '',
        cuisine: '',
        venue: '',
        heat: '',
        instagram: '',
        openNow: false,
        dietary: [],
        promo: false,
        community: false,
      };
      persist();
      modal.hidden = true;
      refresh();
    };
    $('f-apply').onclick = () => {
      const late = $('f-late').checked;
      state.filters = {
        neighbourhood: $('f-n').value,
        distance: $('f-d').value,
        stars: [...$('f-s').selectedOptions].map((o) => o.value),
        price: $('f-p').value,
        cuisine: $('f-c').value,
        venue: $('f-v').value,
        heat: $('f-h').value,
        instagram: $('f-i').value,
        openNow: $('f-open').checked,
        dietary: [...document.querySelectorAll('.f-diet:checked')].map((x) => x.value),
        promo: $('f-promo').checked,
        community: $('f-com').checked,
      };
      if (late && !state.chips.includes('Late-Night')) state.chips.push('Late-Night');
      if (!late) state.chips = state.chips.filter((c) => c !== 'Late-Night');
      persist();
      modal.hidden = true;
      refresh();
    };
  }

  function renderNews() {
    panel.hidden = false;
    const promos = DATA.promotions
      .map((p) => {
        const e = byId(p.eateryId);
        return `
          <article class="promo">
            <span class="badge demo">Demo offer</span>
            <h3>${p.offer}</h3>
            <p>${p.restaurant} · ${p.location} · ${p.type}</p>
            <p class="muted">${p.dates}<br>${p.terms}</p>
            <div class="row">
              <button class="primary" data-open="${p.eateryId}">View deal</button>
              <a class="secondary" href="https://www.google.com/maps/dir/?api=1&destination=${e.lat},${e.lng}" target="_blank" rel="noreferrer">Get directions</a>
            </div>
          </article>`;
      })
      .join('');
    const newest = DATA.newestStores
      .map((n) => {
        const e = byId(n.eateryId);
        return `<article class="news-card"><span class="badge teal">New</span><h3>${e.name}</h3><p class="muted">Opened ${n.opened} · ${e.neighbourhood}</p><p>${n.blurb}</p><button class="secondary" data-open="${e.id}">View on map</button></article>`;
      })
      .join('');
    const friends = DATA.visits
      .filter((v) => state.following.includes(v.foodieId) || v.visibility === 'public')
      .map((v) => {
        const f = DATA.foodies.find((x) => x.id === v.foodieId);
        const e = byId(v.eateryId);
        return `<article class="feed">
          <div class="row"><div class="avatar">${f.avatar}</div><div><strong>${f.name}</strong> ${f.handle}<div class="muted">ate at ${e.name} · ${v.date}</div></div></div>
          <p>${starsHtml(v.rating)} Favourite: ${v.dish}</p>
          <p>${v.review}</p>
          <button class="text-btn" data-open="${e.id}">See place</button>
        </article>`;
      })
      .join('');
    panel.innerHTML = `
      <p class="kicker">News</p>
      <h2>What’s on</h2>
      <div class="row">
        <button class="chip is-on" data-news="promo">Latest promotions</button>
        <button class="chip" data-news="new">Newest stores</button>
        <button class="chip" data-news="friends">Friends ate here</button>
        <button class="chip" data-news="foodies">Fellow foodies</button>
      </div>
      <div id="news-body" class="grid" style="margin-top:16px">${promos}</div>`;
    const body = $('news-body');
    panel.querySelectorAll('[data-news]').forEach((btn) => {
      btn.onclick = () => {
        panel.querySelectorAll('[data-news]').forEach((x) => x.classList.remove('is-on'));
        btn.classList.add('is-on');
        const t = btn.dataset.news;
        if (t === 'promo') body.innerHTML = promos;
        if (t === 'new') body.innerHTML = newest;
        if (t === 'friends') body.innerHTML = friends;
        if (t === 'foodies') body.innerHTML = renderFoodies();
        bindPanelOpens();
      };
    });
    bindPanelOpens();
  }

  function renderFoodies() {
    const byN = {};
    DATA.visits.forEach((v) => {
      const e = byId(v.eateryId);
      byN[e.neighbourhood] = byN[e.neighbourhood] || [];
      byN[e.neighbourhood].push(v);
    });
    const people = DATA.foodies
      .map((f) => {
        const on = state.following.includes(f.id);
        return `<article class="feed"><div class="row"><div class="avatar">${f.avatar}</div><div><strong>${f.name}</strong> ${f.handle}<div class="muted">${f.neighbourhood} · ${f.bio}</div></div>
          <button class="secondary" data-follow="${f.id}">${on ? 'Following' : 'Follow'}</button></div></article>`;
      })
      .join('');
    const hoods = Object.keys(byN)
      .map((n) => {
        const top = byN[n].sort((a, b) => b.rating - a.rating)[0];
        const e = byId(top.eateryId);
        return `<article class="news-card"><p class="kicker">${n}</p><h3>${e.name}</h3><p class="muted">Community pick · ${starsHtml(top.rating)}</p><button class="text-btn" data-open="${e.id}">Open</button></article>`;
      })
      .join('');
    const feed = DATA.visits
      .map((v) => {
        const f = DATA.foodies.find((x) => x.id === v.foodieId);
        const e = byId(v.eateryId);
        return `<article class="feed">
          <div class="row"><div class="avatar">${f.avatar}</div><div><strong>${f.name}</strong><div class="muted">${v.date} · ${e.name}</div></div></div>
          <img class="feed-photo" src="${e.photo}" alt="">
          <p>${starsHtml(v.rating)} ${v.review}</p>
          <p class="muted">Favourite dish: ${v.dish}</p>
        </article>`;
      })
      .join('');
    setTimeout(() => {
      panel.querySelectorAll('[data-follow]').forEach((b) => {
        b.onclick = () => {
          const id = b.dataset.follow;
          if (state.following.includes(id)) state.following = state.following.filter((x) => x !== id);
          else state.following.push(id);
          persist();
          renderNews();
          panel.querySelector('[data-news="foodies"]').click();
        };
      });
    }, 0);
    return `<h3>People</h3>${people}<h3>Popular by neighbourhood</h3>${hoods}<h3>Recent visits</h3>${feed}`;
  }

  function renderCommunity() {
    panel.hidden = false;
    const visits = DATA.visits
      .filter((visit) => visit.visibility === 'public' || (visit.visibility === 'followers' && state.following.includes(visit.foodieId)))
      .map((visit) => ({ visit, foodie: DATA.foodies.find((person) => person.id === visit.foodieId), eatery: byId(visit.eateryId) }))
      .filter((item) => item.foodie && item.eatery)
      .sort((a, b) => new Date(b.visit.date) - new Date(a.visit.date));
    const picksByArea = new Map();
    visits.forEach((item) => {
      const area = item.eatery.neighbourhood;
      const current = picksByArea.get(area);
      if (!current || item.visit.rating > current.visit.rating) picksByArea.set(area, item);
    });
    const areaPicks = [...picksByArea.entries()]
      .map(([area, item]) => ({ area, ...item }))
      .sort((a, b) => a.area.localeCompare(b.area));

    panel.innerHTML = `
      <div class="community-intro">
        <p class="kicker">Outspoke community · demo visits</p>
        <h2>Fellow foodies</h2>
        <p class="muted">Recent meals, neighbourhood favourites, and honest notes from local food explorers.</p>
      </div>
      <section class="community-picks-wrap" aria-label="Popular community places by neighbourhood">
        <div class="community-section-title"><h3>Popular by neighbourhood</h3><span class="muted">Recent community favourites</span></div>
        <div class="community-picks">
          ${areaPicks.map(({ area, visit, eatery }) => `<button type="button" class="community-pick" data-open="${eatery.id}">
            <span class="kicker">${escapeHtml(area)}</span><strong>${escapeHtml(eatery.name)}</strong>
            <span class="muted">${starsHtml(visit.rating)} · ${escapeHtml(visit.dish)}</span>
          </button>`).join('')}
        </div>
      </section>
      <div class="grid community-feed">
        ${visits.map(({ visit, foodie, eatery }) => {
          const social = state.social[visit.id] || { liked: false, comments: [] };
          const comments = Array.isArray(social.comments) ? social.comments : [];
          return `<article class="feed community-card">
            <div class="community-author">
              <div class="avatar">${escapeHtml(foodie.avatar)}</div>
              <div><strong>${escapeHtml(foodie.name)}</strong><div class="muted">${escapeHtml(foodie.handle)} · ${escapeHtml(visit.date)}</div></div>
              <button type="button" class="secondary follow-button" data-follow="${foodie.id}">${state.following.includes(foodie.id) ? 'Following' : 'Follow'}</button>
            </div>
            <button type="button" class="community-photo" data-open="${eatery.id}" aria-label="Open ${escapeHtml(eatery.name)} details">
              <img loading="lazy" src="${escapeHtml(eatery.photo)}" alt="${escapeHtml(visit.dish)} at ${escapeHtml(eatery.name)}">
            </button>
            <div class="community-copy">
              <div class="row community-meta">${starsHtml(visit.rating)} <span class="badge teal">Community visit</span></div>
              <h3>${escapeHtml(eatery.name)} <span class="muted">· ${escapeHtml(eatery.neighbourhood)}</span></h3>
              <p>${escapeHtml(visit.review)}</p>
              <p class="muted">Favourite dish: <strong>${escapeHtml(visit.dish)}</strong></p>
              <div class="row community-actions">
                <button type="button" class="text-btn" data-community-like="${visit.id}" aria-pressed="${Boolean(social.liked)}">${social.liked ? '♥ Liked' : '♡ Like'} <span>${social.liked ? 1 : 0}</span></button>
                <button type="button" class="text-btn" data-community-focus="${visit.id}">Comment${comments.length ? ` · ${comments.length}` : ''}</button>
                <button type="button" class="text-btn" data-share="${eatery.id}">Share</button>
                <button type="button" class="primary" data-open="${eatery.id}">View place</button>
              </div>
              <details class="community-comments" id="comments-${visit.id}">
                <summary>Comments${comments.length ? ` · ${comments.length}` : ' · join the conversation'}</summary>
                <div class="community-comment-list">${comments.map((comment) => `<p><strong>You</strong> ${escapeHtml(comment)}</p>`).join('')}</div>
                <form class="community-comment-form" data-comment-form="${visit.id}">
                  <label class="sr-only" for="comment-${visit.id}">Write a comment</label>
                  <input id="comment-${visit.id}" name="comment" maxlength="300" placeholder="Add a note" required>
                  <button type="submit" class="secondary">Post</button>
                </form>
              </details>
            </div>
          </article>`;
        }).join('') || '<p class="muted">No public visits yet.</p>'}
      </div>
      <p class="muted community-disclaimer">Community names, visit details, and photos shown here are sample data. Visit visibility is controlled from your profile.</p>`;
    bindPanelOpens();
    panel.querySelectorAll('[data-follow]').forEach((button) => {
      button.onclick = () => {
        const id = button.dataset.follow;
        state.following = state.following.includes(id) ? state.following.filter((f) => f !== id) : [...state.following, id];
        persist();
        renderCommunity();
      };
    });
    panel.querySelectorAll('[data-community-like]').forEach((button) => {
      button.onclick = () => {
        const id = button.dataset.communityLike;
        const current = state.social[id] || { liked: false, comments: [] };
        state.social[id] = { ...current, liked: !current.liked, comments: current.comments || [] };
        persist();
        renderCommunity();
      };
    });
    panel.querySelectorAll('[data-share]').forEach((button) => {
      button.onclick = () => sharePlace(button.dataset.share);
    });
    panel.querySelectorAll('[data-community-focus]').forEach((button) => {
      button.onclick = () => {
        const thread = $(`comments-${button.dataset.communityFocus}`);
        thread.open = true;
        thread.querySelector('input').focus();
      };
    });
    panel.querySelectorAll('[data-comment-form]').forEach((form) => {
      form.onsubmit = (event) => {
        event.preventDefault();
        const id = form.dataset.commentForm;
        const comment = form.elements.comment.value.trim();
        if (!comment) return;
        const current = state.social[id] || { liked: false, comments: [] };
        state.social[id] = { ...current, comments: [...(current.comments || []), comment] };
        persist();
        renderCommunity();
      };
    });
  }

  function bindPanelOpens() {
    panel.querySelectorAll('[data-open]').forEach((b) => {
      b.onclick = () => {
        showTab('map');
        openCard(b.dataset.open);
      };
    });
  }

  function renderSearch() {
    panel.hidden = false;
    const hist = state.searchHistory
      .map((q) => `<button class="chip" data-q="${q}">${q}</button>`)
      .join('');
    const trend = DATA.trendingSearches.map((q) => `<button class="chip" data-q="${q}">${q}</button>`).join('');
    const seen = state.lastSeen
      .map(byId)
      .filter(Boolean)
      .map(
        (e) =>
          `<button class="search-item" data-open="${e.id}"><strong>${e.name}</strong><div class="muted">Last seen · ${e.neighbourhood}</div></button>`,
      )
      .join('');
    const results = visibleEateries()
      .slice(0, 12)
      .map(
        (e) =>
          `<button class="search-item" data-open="${e.id}">${starsHtml(e.worthGoing)} <strong>${e.name}</strong><div class="muted">${e.signatureDish} · ${e.priceLabel} · Heat ${e.tiktokHeat} demo</div></button>`,
      )
      .join('');
    panel.innerHTML = `
      <p class="kicker">Search</p>
      <h2>Find a craving</h2>
      <form id="search-form" class="row">
        <input id="search-q" value="${state.query}" placeholder="halal supper, Japanese omakase, dessert near Bugis" style="flex:1;padding:12px 14px;border-radius:999px;border:1px solid var(--line)">
        <button class="primary">Search</button>
      </form>
      <label class="field">Prioritise
        <select id="sort-mob">
          <option value="tiktok">TikTok Heat</option>
          <option value="rating">Worth Going rating</option>
          <option value="location">Distance</option>
          <option value="affordability">Affordability</option>
          <option value="instagram">Instagram</option>
          <option value="community">Community</option>
        </select>
      </label>
      <p class="muted">History</p>
      <div class="chips">${hist || '<span class="muted">Nothing yet</span>'}</div>
      <p class="muted">Trending</p>
      <div class="chips">${trend}</div>
      <p class="muted">Last seen</p>
      <div class="grid">${seen || '<span class="muted">Tap a pin to fill this list.</span>'}</div>
      <h3>Ranked results</h3>
      <div class="grid">${results}</div>`;
    $('sort-mob').value = state.sort;
    $('sort-mob').onchange = () => {
      state.sort = $('sort-mob').value;
      persist();
      renderSearch();
    };
    $('search-form').onsubmit = (ev) => {
      ev.preventDefault();
      submitQuery($('search-q').value);
      showTab('map');
    };
    panel.querySelectorAll('[data-q]').forEach((b) => {
      b.onclick = () => {
        submitQuery(b.dataset.q);
        showTab('map');
      };
    });
    bindPanelOpens();
  }

  function renderChat() {
    panel.hidden = false;
    panel.innerHTML = `
      <p class="kicker">Chat</p>
      <h2>Go with friends — or find a group</h2>
      <p class="muted">Public demo groups exist so you can still makan if your chat is empty.</p>
      <div class="row">
        <button class="primary" id="new-group">Create group</button>
        <button class="secondary" data-tab="map">Reserve from a pin</button>
      </div>
      <div class="grid" id="group-list"></div>
      <h3>Your demo bookings</h3>
      <div class="grid">${state.bookings.map((b) => `<article class="news-card"><strong>${byId(b.eateryId)?.name}</strong><p class="muted">${b.date} ${b.time} · ${b.pax} pax</p></article>`).join('') || '<p class="muted">No bookings yet.</p>'}</div>`;
    const list = $('group-list');
    const draw = () => {
      list.innerHTML = state.groups
        .map(
          (g) => `
        <article class="group">
          <h3>${g.name}</h3>
          <p class="muted">${g.topic} · ${g.members} members</p>
          ${g.messages.map((m) => `<div class="msg"><strong>${m.from}:</strong> ${m.text}</div>`).join('')}
          <form class="row g-form" data-gid="${g.id}">
            <input name="text" placeholder="Say something" style="flex:1;padding:8px 10px;border-radius:12px;border:1px solid var(--line)">
            <button class="secondary">Send</button>
          </form>
        </article>`,
        )
        .join('');
      list.querySelectorAll('.g-form').forEach((form) => {
        form.onsubmit = (ev) => {
          ev.preventDefault();
          const g = state.groups.find((x) => x.id === form.dataset.gid);
          const text = form.text.value.trim();
          if (!text) return;
          g.messages.push({ from: state.profile.name || 'You', text });
          draw();
        };
      });
    };
    draw();
    $('new-group').onclick = () => {
      modal.hidden = false;
      modal.innerHTML = `
        <div class="box">
          <h2>New group</h2>
          <label class="field">Name <input id="gn" placeholder="Tuesday hawker hop"></label>
          <label class="field">Topic <input id="gt" placeholder="Anyone welcome — no existing friends required"></label>
          <div class="row"><button class="primary" id="gc">Create</button><button class="secondary" id="gx">Cancel</button></div>
        </div>`;
      $('gx').onclick = () => (modal.hidden = true);
      $('gc').onclick = () => {
        state.groups.unshift({
          id: `g${Date.now()}`,
          name: $('gn').value || 'Untitled group',
          topic: $('gt').value || 'Open makan group',
          members: 1,
          messages: [{ from: 'Fridge', text: 'Group created. Invite people or just show up.' }],
        });
        modal.hidden = true;
        renderChat();
      };
    };
  }

  function openAccount(force) {
    modal.hidden = false;
    modal.innerHTML = `
      <div class="box">
        <h2>${state.profile.signedIn && !force ? 'Account' : 'Create a free account'}</h2>
        <p class="muted">Optional. Bookmarks and crawls save on this device either way once you sign in locally.</p>
        <label class="field">Name <input id="p-name" value="${state.profile.name}"></label>
        <label class="field">Bio <textarea id="p-bio">${state.profile.bio}</textarea></label>
        <label class="field">Avatar URL <input id="p-av" value="${state.profile.avatar}" placeholder="https://…"></label>
        <div class="row">
          <button class="primary" id="p-save">Save & continue</button>
          <button class="secondary" id="p-x">Not now</button>
        </div>
      </div>`;
    $('p-x').onclick = () => (modal.hidden = true);
    $('p-save').onclick = () => {
      state.profile.signedIn = true;
      state.profile.name = $('p-name').value || 'Foodie';
      state.profile.bio = $('p-bio').value;
      state.profile.avatar = $('p-av').value;
      persist();
      modal.hidden = true;
      renderProfile();
    };
  }

  function renderProfile() {
    panel.hidden = false;
    const p = state.profile;
    const lists = Object.entries(state.bookmarks)
      .map(([name, ids]) => {
        const items = ids.map(byId).filter(Boolean);
        return `<article class="news-card"><h3>${name}</h3>${items.map((e) => `<button class="text-btn" data-open="${e.id}">${e.name}</button>`).join('') || '<p class="muted">Empty</p>'}</article>`;
      })
      .join('');
    panel.innerHTML = `
      <p class="kicker">Profile</p>
      <h2>${p.signedIn ? p.name : 'Guest'}</h2>
      <p class="muted">${p.bio || 'Set a bio, diet, budget, and how public your visits are.'}</p>
      <div class="row">
        <button class="primary" id="btn-account">${p.signedIn ? 'Edit profile' : 'Create account'}</button>
      </div>
      <h3>Food preferences</h3>
      <label class="field">Usual budget
        <select id="pr-budget">
          <option value="any">Any</option>
          <option value="budget">Budget hawker / $15</option>
          <option value="mid">Mid</option>
          <option value="splurge">Splurge</option>
        </select>
      </label>
      <label class="field">I prefer
        <select id="pr-vibe">
          <option value="viral">Viral spots</option>
          <option value="hidden">Hidden gems</option>
          <option value="classic">Classic favourites</option>
        </select>
      </label>
      <p>Dietary</p>
      ${['halal', 'muslim-friendly', 'vegetarian'].map((d) => `<label class="field"><input type="checkbox" class="pr-diet" value="${d}" ${p.dietary.includes(d) ? 'checked' : ''}> ${d}</label>`).join('')}
      <label class="field">Favourite cuisines (comma)
        <input id="pr-cui" value="${p.cuisines.join(', ')}" placeholder="Japanese, Malay, Café">
      </label>
      <label class="field">Preferred areas (comma)
        <input id="pr-areas" value="${p.areas.join(', ')}" placeholder="Joo Chiat, Chinatown">
      </label>
      <h3>Customise UI</h3>
      <label class="field">Accent
        <select id="pr-theme">
          <option value="orange">Orange</option>
          <option value="terracotta">Terracotta</option>
          <option value="citrus">Citrus</option>
        </select>
      </label>
      <label class="field">Density
        <select id="pr-den">
          <option value="comfortable">Comfortable</option>
          <option value="compact">Compact</option>
        </select>
      </label>
      <h3>Privacy</h3>
      <label class="field">Profile visibility
        <select id="pr-vis">
          <option value="public">Public</option>
          <option value="followers">Followers only</option>
          <option value="private">Private</option>
        </select>
      </label>
      <label class="field">Visit sharing
        <select id="pr-visit">
          <option value="public">Public</option>
          <option value="followers">Followers only</option>
          <option value="private">Private</option>
        </select>
      </label>
      <button class="primary" id="pr-save">Save preferences</button>
      <h3>Bookmarks</h3>
      <div class="grid">${lists}</div>
      <form class="row" id="new-list">
        <input name="n" placeholder="New list name" style="flex:1;padding:10px;border-radius:12px;border:1px solid var(--line)">
        <button class="secondary">Add list</button>
      </form>
      <h3>About ratings</h3>
      <article class="news-card">
        <p>Outspoke uses a 1–3 <strong>Worth Going</strong> score, not a 5-star Google clone.</p>
        <ul>
          <li><strong>3 gold:</strong> strong recent TikTok interest, positive sentiment, excellent value or uniqueness.</li>
          <li><strong>2 half-gold:</strong> good social interest, a niche pick, or a solid option in its area.</li>
          <li><strong>1 grey:</strong> visit only if convenient — possibly viral, inconsistent, or overhyped.</li>
        </ul>
        <p>TikTok is weighted first, Instagram second. Google Reviews are not the primary ranking signal. Viral and worth-it are shown separately. TikTok Heat blends recency and popularity so a place trending this week looks different from a long-standing classic. All social and promo figures in this build are <strong>demo data</strong> until a verified data service is connected.</p>
      </article>
      <h3>Other settings</h3>
      <p class="muted">Bookings: ${state.bookings.length} demo request(s). Crawl stops: ${state.crawl.stops.length}.</p>
      <button class="secondary" id="btn-reset">Clear local data</button>`;
    $('pr-budget').value = p.budget;
    $('pr-vibe').value = p.vibe;
    $('pr-theme').value = p.theme;
    $('pr-den').value = p.density;
    $('pr-vis').value = p.visibility;
    $('pr-visit').value = p.visitVisibility;
    $('btn-account').onclick = () => openAccount();
    $('pr-save').onclick = () => {
      state.profile.budget = $('pr-budget').value;
      state.profile.vibe = $('pr-vibe').value;
      state.profile.theme = $('pr-theme').value;
      state.profile.density = $('pr-den').value;
      state.profile.visibility = $('pr-vis').value;
      state.profile.visitVisibility = $('pr-visit').value;
      state.profile.dietary = [...panel.querySelectorAll('.pr-diet:checked')].map((x) => x.value);
      state.profile.cuisines = $('pr-cui').value.split(',').map((s) => s.trim()).filter(Boolean);
      state.profile.areas = $('pr-areas').value.split(',').map((s) => s.trim()).filter(Boolean);
      persist();
      applyTheme();
      refresh();
      toast('Preferences saved. The map ranking is updated.');
    };
    $('new-list').onsubmit = (ev) => {
      ev.preventDefault();
      const name = ev.target.n.value.trim();
      if (!name) return;
      state.bookmarks[name] = state.bookmarks[name] || [];
      persist();
      renderProfile();
    };
    $('btn-reset').onclick = () => {
      localStorage.removeItem(KEY);
      location.reload();
    };
    bindPanelOpens();
  }

  function submitQuery(raw) {
    state.query = (raw || '').trim();
    if (state.query) {
      state.searchHistory = [state.query, ...state.searchHistory.filter((x) => x !== state.query)].slice(0, 10);
      persist();
    }
    refresh();
    showTab('map');
    const top = visibleEateries()[0];
    if (top) map.flyTo([top.lat, top.lng], 14);
  }

  function showTab(tab) {
    state.tab = tab;
    document.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('is-active', b.dataset.tab === tab));
    const mapUi = tab === 'map';
    $('map-search-wrap').style.display = mapUi ? '' : 'none';
    drawer.style.display = mapUi ? '' : 'none';
    panel.hidden = mapUi;
    if (!mapUi) sheet.hidden = true;
    document.body.classList.toggle('split', mapUi && window.matchMedia('(min-width: 960px)').matches);
    listPane.hidden = !mapUi || !window.matchMedia('(min-width: 960px)').matches;
    if (tab === 'news') renderNews();
    if (tab === 'foodies') renderCommunity();
    if (tab === 'search') renderSearch();
    if (tab === 'chat') renderChat();
    if (tab === 'profile') renderProfile();
    if (tab === 'map') refresh();
  }

  function refresh() {
    applyTheme();
    renderChips();
    renderTrending();
    renderPins();
    renderHotzones();
  }

  function initMap() {
    map = L.map('map', { zoomControl: false }).setView(SG_CENTER, 12);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);
    pinLayer = L.layerGroup().addTo(map);
    hotLayer = L.layerGroup().addTo(map);
    map.setMaxBounds([
      [1.15, 103.6],
      [1.48, 104.1],
    ]);
  }

  function bindUi() {
    document.querySelectorAll('[data-tab]').forEach((b) => {
      b.addEventListener('click', () => showTab(b.dataset.tab));
    });
    $('btn-home').onclick = () => showTab('map');
    $('crave-form').onsubmit = (ev) => {
      ev.preventDefault();
      submitQuery($('crave-input').value);
    };
    $('chips').addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-chip]');
      if (!btn) return;
      const c = btn.dataset.chip;
      state.chips = state.chips.includes(c) ? state.chips.filter((x) => x !== c) : [...state.chips, c];
      refresh();
    });
    $('btn-hotzones').onclick = () => {
      state.hotzonesOn = !state.hotzonesOn;
      $('btn-hotzones').classList.toggle('is-on', state.hotzonesOn);
      renderHotzones();
      if (state.hotzonesOn) map.flyTo(SG_CENTER, 12);
    };
    $('btn-crawl').onclick = openCrawl;
    $('btn-filters').onclick = openFilters;
    $('btn-collapse-drawer').onclick = () => drawer.classList.toggle('is-collapsed');
    let startY = 0;
    $('drawer-handle').addEventListener('touchstart', (e) => {
      startY = e.touches[0].clientY;
    });
    $('drawer-handle').addEventListener('touchend', (e) => {
      const dy = e.changedTouches[0].clientY - startY;
      if (dy > 24) drawer.classList.add('is-collapsed');
      if (dy < -24) drawer.classList.remove('is-collapsed');
    });
    document.addEventListener('click', (ev) => {
      const open = ev.target.closest('[data-open]');
      if (open && !panel.contains(open) && !sheet.contains(open)) {
        /* carousel */
      }
    });
    $('trending-carousel').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-open]');
      if (b) openCard(b.dataset.open);
    });
    listPane.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-open]');
      if (b) openCard(b.dataset.open);
    });
    modal.addEventListener('click', (ev) => {
      if (ev.target === modal) modal.hidden = true;
    });
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        state.userHere = [pos.coords.latitude, pos.coords.longitude];
        refresh();
      },
      () => {},
      { timeout: 2500 },
    );
  }

  initMap();
  bindUi();
  refresh();
  const sharedPlace = new URLSearchParams(location.hash.slice(1)).get('place');
  if (sharedPlace && byId(sharedPlace)) openCard(sharedPlace);
})();
