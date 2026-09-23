// Supabase owns authentication and enforces permissions through database RLS.
window.accountClient = window.APP_CONFIG?.url && window.APP_CONFIG?.key && window.supabase
  ? window.supabase.createClient(APP_CONFIG.url, APP_CONFIG.key) : null;
window.accountUser = null;
window.accountReady = (async () => {
  if (!accountClient) return;
  const {data,error}=await accountClient.auth.getSession();
  if(error) throw error;
  window.accountUser=data.session?.user || null;
})();
const accountDialog=document.querySelector('#accountDialog');
const accountContent=document.querySelector('#accountContent');
const accountMessage=document.querySelector('#accountMessage');
const safeText=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function showAccount() {
  accountMessage.textContent='';
  accountDialog.showModal();
  if(!accountClient){accountContent.innerHTML='<h2>Welcome to MakanMates</h2><p>Discover food around Singapore. Accounts will be available once the service is connected.</p>';return;}
  await accountReady;
  if(!accountUser){
    accountContent.innerHTML='<h2>Join MakanMates</h2><form id="loginForm"><label>Email<input name="email" type="email" required autocomplete="email"></label><label>Password<input name="password" type="password" minlength="8" required autocomplete="current-password"></label><button name="action" value="login">Sign in</button><button name="action" value="signup">Create account</button></form><button id="googleLogin">Continue with Google</button>';
    document.querySelector('#loginForm').onsubmit=async e=>{
      e.preventDefault();const f=new FormData(e.target);
      try{const method=e.submitter.value==='signup'?'signUp':'signInWithPassword';
        const {data,error}=await accountClient.auth[method]({email:f.get('email'),password:f.get('password')});
        if(error)throw error;if(data.session)location.reload();else accountMessage.textContent='Check your email to confirm your account.';
      }catch(err){accountMessage.textContent=err.message;}
    };
    document.querySelector('#googleLogin').onclick=async()=>{
      const {error}=await accountClient.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin}});
      if(error)accountMessage.textContent=error.message;
    };return;
  }
  const {data,error}=await accountClient.from('profiles').select('*').eq('id',accountUser.id).maybeSingle();
  if(error){accountMessage.textContent=error.message;return;}
  accountContent.innerHTML='<h2>Your profile</h2><form id="profileForm"><label>Name<input name="display_name" maxlength="100" required value="'+safeText(data?.display_name||'')+'"></label><label>Bio<textarea name="bio" maxlength="500">'+safeText(data?.bio||'')+'</textarea></label><label>Favourite cuisines (comma separated)<input name="cuisines" value="'+safeText((data?.preferences?.cuisines||[]).join(', '))+'"></label><button>Save profile</button></form><button id="signOut">Sign out</button>';
  document.querySelector('#profileForm').onsubmit=async e=>{
    e.preventDefault();const f=new FormData(e.target);
    const {error}=await accountClient.from('profiles').upsert({id:accountUser.id,display_name:f.get('display_name'),bio:f.get('bio'),preferences:{cuisines:f.get('cuisines').split(',').map(x=>x.trim()).filter(Boolean)}});
    accountMessage.textContent=error?error.message:'Profile saved.';
  };
  document.querySelector('#signOut').onclick=async()=>{const {error}=await accountClient.auth.signOut();if(error)accountMessage.textContent=error.message;else location.reload();};
}
document.querySelector('#accountButton').onclick=()=>showAccount().catch(e=>accountMessage.textContent=e.message);
document.querySelector('#closeAccount').onclick=()=>accountDialog.close();
