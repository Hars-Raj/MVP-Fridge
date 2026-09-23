let places = [], selected = null, filter = 'all', map, markers = [], origin = null;
const $ = s => document.querySelector(s);
const escape = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let saved;
try { saved = JSON.parse(localStorage.getItem('pindrop-seed-saved') || '[]'); if (!Array.isArray(saved)) saved = []; } catch { saved = []; }
function distance(p) {
  if (!origin || !p.coords) return Infinity;
  const rad = n => n * Math.PI / 180;
  const a = Math.sin(rad(p.coords[1]-origin[1])/2)**2 + Math.cos(rad(origin[1]))*Math.cos(rad(p.coords[1]))*Math.sin(rad(p.coords[0]-origin[0])/2)**2;
  return 6371*2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function current() {
  const q = $('#query').value.toLowerCase();
  return places.filter(p => [p.name,p.cuisine,p.address,...p.tags].join(' ').toLowerCase().includes(q))
    .filter(p => filter === 'all' || (filter === 'cheap' && p.price_level === 1) || (filter === 'cafe' && p.category === 'Cafe') || (filter === 'hawker' && p.tags.includes('hawker')) || (filter === 'nearby' && distance(p) <= 3))
    .sort((a,b) => $('#sort').value === 'rating' ? reviewAverage(b)-reviewAverage(a) : $('#sort').value === 'price' ? a.price_level-b.price_level : $('#sort').value === 'distance' ? distance(a)-distance(b) : a.name.localeCompare(b.name));
}
function icon(p) { return p.category === 'Cafe' ? '☕' : p.category === 'Dessert' ? '🍰' : '🍜'; }
function reviewAverage(p) {
  const reviews = p.user_reviews || [];
  return reviews.length ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0;
}
function ratingLabel(p) {
  const count = (p.user_reviews || []).length;
  return count ? '★ ' + reviewAverage(p).toFixed(1) + ' · ' + count + ' user reviews' : 'No reviews yet';
}
function renderReviews(p) {
  const reviews = p.user_reviews || [];
  return (accountUser ? '<form id="reviewForm"><label>Your rating<select name="rating">'+[5,4,3,2,1].map(n=>'<option>'+n+'</option>').join('')+'</select></label><label>Your review<textarea name="body" maxlength="3000" required></textarea></label><button>Save / replace my review</button><button type="button" id="deleteReview">Delete my review</button></form>' : '<p>Sign in through Account to leave a review.</p>') + '<section class="reviews"><h3>Community reviews</h3><p class="demo-disclaimer">Ratings from MakanMates members.</p><div class="review-total"><strong>' + (reviews.length ? reviewAverage(p).toFixed(1) : '—') + '<small> / 5</small></strong><span>Average of ' + reviews.length + ' user ratings</span></div>' +
    reviews.map(r => '<article class="review"><div class="review-header"><b>' + escape(r.author || 'MakanMates member') + '</b><span aria-label="' + r.rating + ' out of 5 stars">' + '★'.repeat(r.rating) + '☆'.repeat(5-r.rating) + '</span></div><p>' + escape(r.body) + '</p></article>').join('') + '</section>';
}
function meta(p) { return '$'.repeat(p.price_level) + (Number.isFinite(distance(p)) ? ' · '+distance(p).toFixed(1)+' km' : ''); }
function selectPlace(id) {
  selected = id; renderSelected();
  $('.grid').prepend($('#selectedPlace')); $('.grid').scrollTop = 0;
  const p = places.find(p => p.id === id);
  if (map && p.coords) map.flyTo({center:p.coords,zoom:16,offset:matchMedia('(max-width: 800px)').matches ? [0,-40] : [230,0]});
}
function saveButton(p) { return '<button class="save" data-save="'+p.id+'" aria-label="Bookmark '+escape(p.name)+'" aria-pressed="'+saved.includes(p.id)+'">'+(saved.includes(p.id)?'♥':'♡')+'</button>'; }
function renderSelected() {
  const p = places.find(p => p.id === selected);
  if (!p) { $('#selectedPlace').innerHTML='<div class="welcome">Select a place to explore its details.</div>'; return; }
  $('#selectedPlace').innerHTML='<button class="back-button" id="closeDetails">← Back to places</button><div class="selected-place-title"><h2>'+escape(p.name)+'</h2>'+saveButton(p)+'</div><p>'+escape(p.cuisine)+' · '+meta(p)+'</p><p>'+escape(p.description)+'</p><p>'+escape(p.address)+'</p><p><a target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&amp;destination='+encodeURIComponent(p.name+' '+p.address)+'">Get directions</a> · <button data-share="'+p.id+'">Share place</button></p><p>Opening hours: not provided</p><p>'+p.tags.map(t=>'<span class="tag">'+escape(t)+'</span>').join(' ')+'</p><p>'+escape(p.locationStatus)+'</p>'+renderReviews(p)+'<details><summary>Seed data source</summary><p>'+escape(p.source)+'</p><p>Imported from supplied research; listings, prices and source claims are not independently verified.</p></details>';
}
function renderMarkers() {
  if (!map) return;
  markers.forEach(m=>m.remove()); markers=[];
  // One marker per building lets users choose between stalls sharing an address.
  const groups = new Map();
  current().filter(p=>p.coords).forEach(p=>{const key=p.coords.join(','); if(!groups.has(key))groups.set(key,[]);groups.get(key).push(p);});
  groups.forEach(group=>{
    const el=document.createElement('button'); el.className='pin';el.textContent=group.length>1?group.length:icon(group[0]);el.setAttribute('aria-label',group.map(p=>p.name).join(', '));
    const popup=document.createElement('div');
    group.forEach(p=>{const b=document.createElement('button');b.textContent=p.name;b.addEventListener('click',()=>selectPlace(p.id));popup.append(b);});
    el.addEventListener('click',()=>selectPlace(group[0].id));
    markers.push(new mapboxgl.Marker({element:el}).setLngLat(group[0].coords).setPopup(new mapboxgl.Popup({offset:25}).setDOMContent(popup)).addTo(map));
  });
}
function render() {
  const rows=current();$('#count').textContent=rows.length+' places';
  $('#places').innerHTML=rows.map(p=>'<article class="card"><button class="place-open" data-place="'+p.id+'"><span class="food">'+icon(p)+'</span><span><strong>'+escape(p.name)+'</strong><p>'+escape(p.cuisine)+'</p><p>'+meta(p)+'</p><p class="rating-label">'+ratingLabel(p)+'</p></span></button>'+saveButton(p)+'</article>').join('') || '<p>No matches. Nearby requires your location and resolved map pins.</p>';
  $('#savedCount').textContent=saved.length;
  $('#saved').innerHTML=places.filter(p=>saved.includes(p.id)).map(p=>'<p><button data-place="'+p.id+'">'+escape(p.name)+'</button></p>').join('')||'<p>Save places to build your collection.</p>';
  renderSelected();renderMarkers();
}
function toast(message) { $('#toast').textContent=message;$('#toast').classList.add('show');setTimeout(()=>$('#toast').classList.remove('show'),3500); }
async function geocode() {
  // Temporary geocodes stay in this page's memory; never persist provider results.
  for (const p of places) {
    if (!/Singapore \d{6}$/.test(p.address)) { p.locationStatus='Exact address needed; no map pin yet.';continue; }
    try {
      const query=p.address.replace(/#[\d\w\-/]+,?\s*/g,'');
      const params=new URLSearchParams({q:query,country:'sg',types:'address',limit:'1',autocomplete:'false',access_token:window.MAPBOX_ACCESS_TOKEN});
      const response=await fetch('https://api.mapbox.com/search/geocode/v6/forward?'+params);
      if(!response.ok) throw Error('Geocoding unavailable');
      const feature=(await response.json()).features?.[0];
      const coords=feature?.geometry?.coordinates;
      if(coords && coords[0]>103.5 && coords[0]<104.2 && coords[1]>1.1 && coords[1]<1.5) {
        p.coords=coords;p.locationStatus='Address-level map pin; stall location may vary.';
      } else p.locationStatus='Address could not be located; confirmation needed.';
    } catch { p.locationStatus='Map pin unavailable. Place details are still accessible.'; }
    render();
  }
  render();
}
async function start() {
  try {
    await accountReady;
    let rows;
    if(accountClient) {
      const result=await accountClient.from('places').select('*');if(result.error)throw result.error;rows=result.data;
      const reviews=await accountClient.from('reviews').select('*');if(reviews.error)throw reviews.error;
      rows=rows.map(p=>({...p,user_reviews:reviews.data.filter(r=>r.place_id===p.id)}));
      if(accountUser){const result=await accountClient.from('saves').select('place_id').eq('user_id',accountUser.id);if(result.error)throw result.error;saved=result.data.map(s=>s.place_id);}
    } else {
      const response=await fetch('/places.json');if(!response.ok)throw Error('Dataset unavailable');
      rows=await response.json();
    }
    places=rows.map(p=>({...p,locationStatus:'Locating address…'}));
    saved=saved.filter(id=>places.some(p=>p.id===id));render();
    const linked=new URLSearchParams(location.hash.slice(1)).get('place');if(places.some(p=>p.id===linked))selectPlace(linked);
    if(!window.mapboxgl || !window.MAPBOX_ACCESS_TOKEN) {
      $('#map').innerHTML='<div class="map-missing">Map unavailable. You can still browse places.</div>';
      places.forEach(p=>p.locationStatus='Map not configured.');render();return;
    }
    map=new mapboxgl.Map({container:'map',accessToken:window.MAPBOX_ACCESS_TOKEN,style:'mapbox://styles/mapbox/streets-v12',center:[103.85,1.33],zoom:11});
    map.addControl(new mapboxgl.NavigationControl(),'top-right');
    map.on('load',renderMarkers);
    map.on('error',()=>toast('Some map resources could not load.'));
    await geocode();
  } catch { $('#places').innerHTML='<p>Could not load food spots. Refresh to retry.</p>'; }
}
$('#sort').innerHTML='<option value="name">Name A–Z</option><option value="rating">Top rated</option><option value="price">Most affordable</option><option value="distance">Nearest first</option>';
$('.chips').innerHTML='<button class="active" data-filter="all">All places</button><button data-filter="nearby">Within 3 km</button><button data-filter="cheap">Budget</button><button data-filter="cafe">Cafes</button><button data-filter="hawker">Hawker food</button>';
$('.news-panel').innerHTML='<h2>Singapore food guide</h2><p>Browse 35 food spots from the supplied research. Prices are indicative seed data; check with the venue before visiting.</p>';
document.addEventListener('click',async event=>{
  if(event.target.closest('#closeDetails')) { selected=null; renderSelected(); $('.grid').scrollTop=0; return; }
  const s=event.target.closest('[data-save]');
  if(s && accountClient) { if(!accountUser){showAccount();return;} const id=s.dataset.save; const result=saved.includes(id)?await accountClient.from('saves').delete().eq('user_id',accountUser.id).eq('place_id',id):await accountClient.from('saves').insert({user_id:accountUser.id,place_id:id});if(result.error){toast(result.error.message);return;} }
  if(s){const id=s.dataset.save;saved=saved.includes(id)?saved.filter(x=>x!==id):[...saved,id];try{localStorage.setItem('pindrop-seed-saved',JSON.stringify(saved));}catch{toast('Bookmarks will last for this session only.');}render();return;}
  const share=event.target.closest('[data-share]');
  if(share){const url=location.origin+'/#place='+encodeURIComponent(share.dataset.share);try{await navigator.clipboard.writeText(url);toast('Place link copied.');}catch{toast(url);}return;}
  if(event.target.closest('#deleteReview') && accountUser){const {error}=await accountClient.from('reviews').delete().eq('place_id',selected).eq('user_id',accountUser.id);if(error)toast(error.message);else {const p=places.find(p=>p.id===selected);p.user_reviews=p.user_reviews.filter(r=>r.user_id!==accountUser.id);render();}return;}
  const p=event.target.closest('[data-place]');if(p)selectPlace(p.dataset.place);
  const f=event.target.closest('[data-filter]');if(f){filter=f.dataset.filter;document.querySelectorAll('[data-filter]').forEach(b=>b.classList.toggle('active',b===f));if(filter==='nearby'&&!origin)toast('Use my location to find nearby places.');render();}
});
$('#query').addEventListener('input',render);
$('#sort').addEventListener('change',()=>{if($('#sort').value==='distance'&&!origin)toast('Use my location to sort by distance.');render();});
$('#locate').addEventListener('click',()=>{
  if(!navigator.geolocation){toast('Location is unavailable in this browser.');return;}
  navigator.geolocation.getCurrentPosition(p=>{origin=[p.coords.longitude,p.coords.latitude];render();if(map)map.flyTo({center:origin,zoom:13});},()=>toast('Could not get your location. Check browser permissions.'),{timeout:10000});
});
document.addEventListener('submit',async e=>{
  if(e.target.id!=='reviewForm')return;e.preventDefault();
  if(!accountUser)return;
  const form=new FormData(e.target);const body=String(form.get('body')).trim();if(!body){toast('Please write a review.');return;}
  const {data,error}=await accountClient.from('reviews').upsert({user_id:accountUser.id,place_id:selected,rating:Number(form.get('rating')),body},{onConflict:'user_id,place_id'}).select().single();
  if(error){toast(error.message);return;}
  const p=places.find(p=>p.id===selected);p.user_reviews=[...(p.user_reviews||[]).filter(r=>r.user_id!==accountUser.id),data];render();toast('Review saved.');
});
start();
// Local presentation feed: demo content is separate from community review scores.
const feedPhotos = [
  ['photo-1569718212165-3a8278d5f624','A bowl of noodles'],
  ['photo-1517248135467-4c7edcad34c4','A restaurant dining room'],
  ['photo-1501339847302-ac426a4a7cbb','A cafe setting'],
  ['photo-1495474472287-4d71bcdd2085','Coffee being served'],
  ['photo-1555939594-58d7cb561ad1','Food cooked over a grill']
];
let feedData=[], feedView='explore', feedState;
try { feedState=JSON.parse(localStorage.getItem('makanmates-feed-v1')||'{}'); } catch { feedState={}; }
if(!feedState || typeof feedState!=='object' || Array.isArray(feedState))feedState={};
function feedEntry(id) {
  const entry=feedState[id];
  if(!entry || !Array.isArray(entry.comments))feedState[id]={liked:false,comments:[]};
  return feedState[id];
}
function persistFeed() {
  try { localStorage.setItem('makanmates-feed-v1',JSON.stringify(feedState)); }
  catch { toast('Browser storage is full. Changes are kept for this session.'); }
}
function feedScore(p) { const s=feedEntry(p.id);return p.likes+Number(s.liked)+s.comments.length*3; }
function feedCard(post) {
  const state=feedEntry(post.id), photo=feedPhotos[post.photo];
  const comments=state.comments.filter(c=>typeof c==='string');
  return '<article class="social-card" id="post-'+post.id+'"><header><span class="social-avatar">'+escape(post.author.slice(0,1))+'</span><div><strong>'+escape(post.author)+'</strong><small>Demo food diary · Singapore</small></div><span class="social-badge">DEMO</span></header>'+
    '<div class="social-photo"><img loading="lazy" width="720" height="820" src="https://images.unsplash.com/'+photo[0]+'?auto=format&fit=crop&w=900&q=80" alt="'+escape(photo[1])+' — illustrative photo"><span>Food inspiration · illustrative image</span></div>'+
    '<div class="social-body"><div class="social-actions"><button data-feed-like="'+post.id+'" aria-pressed="'+Boolean(state.liked)+'" aria-label="Like this post">'+(state.liked?'♥':'♡')+' <span>'+feedScore(post)+'</span></button><button data-feed-comment="'+post.id+'">Comments '+comments.length+'</button><button data-feed-place="'+post.place.id+'">View place ↗</button></div>'+
    '<h2>'+escape(post.place.name)+'</h2><p class="social-location">'+escape(post.place.cuisine)+' · '+'$'.repeat(post.place.price_level)+'</p><p>'+escape(post.caption)+'</p>'+
    '<blockquote><span>Demo review · '+post.rating+'/5</span>'+escape(post.review)+'</blockquote>'+
    '<details id="comments-'+post.id+'"><summary>Join the conversation ('+comments.length+')</summary><div class="comment-list">'+comments.map(c=>'<p><b>You · demo</b> '+escape(c)+'</p>').join('')+'</div><form data-feed-form="'+post.id+'"><label class="sr-only" for="comment-'+post.id+'">Write a comment</label><input id="comment-'+post.id+'" name="comment" maxlength="500" required placeholder="What do you think?"><button>Post</button></form></details></div></article>';
}
function drawFeed() {
  const rows=[...feedData];if(feedView==='trending')rows.sort((a,b)=>feedScore(b)-feedScore(a));
  $('#feedPosts').innerHTML=rows.map(feedCard).join('');
  $('#feedPosts').querySelectorAll('img').forEach(img=>img.addEventListener('error',()=>{img.hidden=true;img.parentElement.classList.add('image-unavailable');img.parentElement.querySelector('span').textContent='Photo unavailable · '+img.alt;}));
}
async function showFeed(view) {
  if(view==='map'||view==='saved') {
    document.body.classList.remove('feed-mode');$('#socialFeed').hidden=true;
    if(map)map.resize();
    if(view==='saved')$('#profile').scrollIntoView({block:'nearest'});
    return;
  }
  feedView=view;document.body.classList.add('feed-mode');$('#socialFeed').hidden=false;
  $('#feedTitle').textContent=view==='trending'?'On everyone’s plate.':'Your next craving.';
  document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  if(!feedData.length) {
    $('#feedPosts').textContent='Loading food stories…';
    try {
      const response=await fetch('/places.json');if(!response.ok)throw Error();
      const seed=await response.json();
      feedData=seed.map((p,i)=>({id:'story-'+p.id,place:p,author:['Maya Eats','Arun’s Food Stops','Jia’s Weekend Bites','Nadia Explores'][i%4],photo:p.category==='Cafe'?3:p.category==='Restaurant'?1:p.category==='Hawker Centre'?4:0,likes:24+(i*37)%217,caption:['Adding this to the next food crawl. Who’s coming along?','A little inspiration for the weekend makan plan. Save this spot for later.','One more place on our Singapore food wishlist. What would you order?'][i%3],rating:p.demo_reviews?.[0]?.rating||4,review:p.demo_reviews?.[0]?.text||'A demo food discovery story.'}));
    } catch { $('#feedPosts').textContent='Could not load stories. Tap Explore to retry.';return; }
  }
  drawFeed();
}
document.addEventListener('click',async e=>{
  const nav=e.target.closest('[data-view]');if(nav){e.preventDefault();showFeed(nav.dataset.view);return;}
  const like=e.target.closest('[data-feed-like]');
  if(like){const post=feedData.find(p=>p.id===like.dataset.feedLike);const entry=feedEntry(post.id);entry.liked=!entry.liked;persistFeed();like.setAttribute('aria-pressed',String(entry.liked));like.innerHTML=(entry.liked?'♥':'♡')+' <span>'+feedScore(post)+'</span>';return;}
  const comment=e.target.closest('[data-feed-comment]');
  if(comment){const details=document.getElementById('comments-'+comment.dataset.feedComment);details.open=true;details.querySelector('input').focus();return;}
  const place=e.target.closest('[data-feed-place]');
  if(place){if(!places.some(p=>p.id===place.dataset.feedPlace)){toast('Place details are still loading. Try again shortly.');return;}showFeed('map');selectPlace(place.dataset.feedPlace);}
});
document.addEventListener('submit',e=>{
  if(!e.target.matches('[data-feed-form]'))return;e.preventDefault();
  const id=e.target.dataset.feedForm, input=e.target.elements.comment, comment=input.value.trim();if(!comment)return;
  feedEntry(id).comments.push(comment);persistFeed();
  const card=document.getElementById('post-'+id);card.outerHTML=feedCard(feedData.find(p=>p.id===id));
  const details=document.getElementById('comments-'+id);details.open=true;details.querySelector('input').focus();
});
