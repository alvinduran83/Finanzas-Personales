import './style.css'
import { supabase } from './supabase.js'

const $ = (id) => document.getElementById(id)
const money = (n) => new Intl.NumberFormat('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const MSG_CONFIRMAR = 'Te enviamos un correo para confirmar tu cuenta. Confírmalo y luego inicia sesión.'

let mode = 'login'
let cuentas = []
let editId = null

// ---------- Autenticación ----------
function showAuthMsg(text, ok = false) {
  $('authErr').textContent = text
  $('authErr').classList.toggle('ok', ok)
}

function setMode(m) {
  mode = m
  const reg = m === 'register'
  $('authTitle').textContent = reg ? 'Crear acceso' : 'Iniciar sesión'
  $('authSub').textContent = reg ? 'Usa tu correo y una clave de al menos 6 caracteres.' : 'Entra para ver y gestionar tus cuentas.'
  $('authBtn').textContent = reg ? 'Crear acceso' : 'Entrar'
  $('confirmBox').classList.toggle('hidden', !reg)
  $('toggleTxt').textContent = reg ? '¿Ya tienes usuario?' : '¿No tienes usuario?'
  $('toggleBtn').textContent = reg ? 'Iniciar sesión' : 'Crear cuenta de acceso'
  $('pass').autocomplete = reg ? 'new-password' : 'current-password'
  showAuthMsg('')
}

async function submitAuth() {
  const email = $('email').value.trim()
  const password = $('pass').value
  if (!email || !password) return showAuthMsg('Escribe correo y clave.')
  if (mode === 'register') {
    if (password.length < 6) return showAuthMsg('La clave debe tener al menos 6 caracteres.')
    if (password !== $('pass2').value) return showAuthMsg('Las claves no coinciden.')
  }
  $('authBtn').disabled = true
  const { data, error } =
    mode === 'register'
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password })
  $('authBtn').disabled = false
  if (error) {
    return showAuthMsg(error.message === 'Invalid login credentials' ? 'Correo o clave incorrectos.' : error.message)
  }
  if (mode === 'register' && !data.session) {
    setMode('login')
    showAuthMsg(MSG_CONFIRMAR, true)
  }
}

async function onSession(session) {
  const logged = !!session
  $('auth').classList.toggle('hidden', logged)
  $('app').classList.toggle('hidden', !logged)
  if (logged) {
    $('who').textContent = 'Sesión de ' + session.user.email
    $('email').value = $('pass').value = $('pass2').value = ''
    await cargarCuentas()
  } else {
    cuentas = []
    setMode('login')
  }
}

// ---------- Mantenimiento de cuentas ----------
async function cargarCuentas() {
  const { data, error } = await supabase.from('cuentas').select('*').order('created_at')
  if (error) {
    $('list').innerHTML = `<li class="empty">No se pudieron cargar las cuentas: ${esc(error.message)}</li>`
    return
  }
  cuentas = data
  render()
}

function render() {
  $('total').textContent = money(cuentas.reduce((s, a) => s + Number(a.saldo_inicial), 0))
  $('list').innerHTML = cuentas.length
    ? cuentas.map((a) => `
      <li class="row"><div><b>${esc(a.nombre)}</b><small>${esc(a.tipo)}</small></div>
      <div class="acts"><span class="bal">${money(Number(a.saldo_inicial))}</span>
      <button class="btn ghost sm" data-edit="${a.id}">Editar</button>
      <button class="btn danger sm" data-del="${a.id}">Eliminar</button></div></li>`).join('')
    : '<li class="empty">Aún no tienes cuentas. Crea la primera, por ejemplo “Cuenta de Ahorro”.</li>'
}

function openDlg(id) {
  editId = id || null
  const a = cuentas.find((x) => x.id === id)
  $('dlgTitle').textContent = a ? 'Editar cuenta' : 'Nueva cuenta'
  $('aName').value = a ? a.nombre : ''
  $('aType').value = a ? a.tipo : 'Ahorro'
  $('aBal').value = a ? a.saldo_inicial : 0
  $('dlgErr').textContent = ''
  $('dlg').showModal()
  $('aName').focus()
}

async function saveAcc() {
  const nombre = $('aName').value.trim()
  const saldo_inicial = parseFloat($('aBal').value)
  if (!nombre) return ($('dlgErr').textContent = 'Escribe un nombre para la cuenta.')
  if (Number.isNaN(saldo_inicial)) return ($('dlgErr').textContent = 'El saldo inicial debe ser un número.')
  const fila = { nombre, tipo: $('aType').value, saldo_inicial }
  $('dlgSave').disabled = true
  const { error } = editId
    ? await supabase.from('cuentas').update(fila).eq('id', editId)
    : await supabase.from('cuentas').insert(fila)
  $('dlgSave').disabled = false
  if (error) {
    $('dlgErr').textContent = error.code === '23505' ? 'Ya existe una cuenta con ese nombre.' : error.message
    return
  }
  $('dlg').close()
  await cargarCuentas()
}

async function deleteAcc(id) {
  const a = cuentas.find((x) => x.id === id)
  if (!a || !confirm(`¿Eliminar la cuenta “${a.nombre}”?`)) return
  const { error } = await supabase.from('cuentas').delete().eq('id', id)
  if (error) return alert('No se pudo eliminar: ' + error.message)
  await cargarCuentas()
}

// ---------- Eventos ----------
$('authBtn').onclick = submitAuth
$('authForm').addEventListener('keydown', (e) => { if (e.key === 'Enter') submitAuth() })
$('toggleBtn').onclick = () => setMode(mode === 'login' ? 'register' : 'login')
$('logout').onclick = () => supabase.auth.signOut()
$('newAcc').onclick = () => openDlg()
$('dlgCancel').onclick = () => $('dlg').close()
$('dlgSave').onclick = saveAcc
$('list').onclick = (e) => {
  if (e.target.dataset.edit) openDlg(e.target.dataset.edit)
  if (e.target.dataset.del) deleteAcc(e.target.dataset.del)
}

supabase.auth.onAuthStateChange((_evt, session) => { onSession(session) })
