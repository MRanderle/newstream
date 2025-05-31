var express = require('express');
var router = express.Router();


/**
 * 
 * Rotas GET de usuários
 * 
 */


/* GET home page (login) */
router.get('/', function(req, res, next) {
  if (global.usuarioEmail && global.usuarioEmail != "") {
    res.redirect('/browse');
  }

  res.render('index', { titulo: 'MFlix - Login' });
});



/* GET escolha de perfil */
router.get('/perfis', async function(req, res, next) {
  verificarLogin(res);
  const registrosPerfis = await global.banco.buscarPerfis(global.usuarioCodigo);

  if (registrosPerfis.length == 1)
  {
    global.perfilCodigo = registrosPerfis[0].percodigo;
    res.redirect('/browse');
  } 

  res.render('perfis', { titulo: 'MFlix - Escolha de Perfil', registrosPerfis });
});



/* GET registrar perfil escolhido */
router.get('/entrarPerfil/:id', async function(req, res, next) {
  verificarLogin(res);
  const codigoPerfil = parseInt(req.params.id);
  const dadosPerfil = await global.banco.buscarPerfil(codigoPerfil);
  global.perfil = dadosPerfil;
  res.redirect('/browse');
});



/* GET escolha de vídeo */
router.get('/browse', function(req, res, next) {
  verificarLogin(res);
  res.render('browse', { titulo: 'MFlix - Escolha de Vídeo', imagem: global.perfil.perfoto });
});



/**
 * 
 * Rotas POST de usuários
 * 
 */


/* POST login */
router.post('/login', async function(req, res, next){
  const email = req.body.email ;
  const senha = req.body.senha;

  const usuario = await global.banco.buscarUsuario({email,senha});

  global.usuarioCodigo = usuario.usucodigo;
  global.usuarioEmail = usuario.usuemail;
  res.redirect('/perfis');
})



/**
 * 
 * Funções diversas
 * 
 */

function verificarLogin(res)
{
  if (!global.usuarioEmail || global.usuarioEmail == "")
    res.redirect('/');
}



module.exports = router;
