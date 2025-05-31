const mysql = require('mysql2/promise'); 

async function conectarBD()
{ 
    if(global.conexao && global.conexao.state !== 'disconnected') 
    {
        return global.conexao;
    }
    
    /*
    const connectionString = 'mysql://root:senha@localhost:3306/livraria' 
    const connection= await mysql.createConnection(connectionString)
    */
    
    const conexao = await mysql.createConnection(
        { 
            host     : 'localhost', 
            port     : 3306, 
            user     : 'root',
            password : '', 
            database : 'mflix' 
        }); 
        
    console.log('Conectou no MySQL!'); 

    global.conexao = conexao; 
    return global.conexao; 
} 


async function buscarUsuario(usuario)
{
    const conexao = await conectarBD();
    const sql = "select * from usuarios where usuemail=? and ususenha=?;";
    const [usuarioEcontrado] = await conexao.query(sql,[usuario.email, usuario.senha]);
    return usuarioEcontrado && usuarioEcontrado.length>0 ? usuarioEcontrado[0] : {};
}


async function buscarPerfis(usuario)
{
    const conexao = await conectarBD();
    const sql = "select * from perfis where usucodigo=?;";
    const [perfisEcontrados] = await conexao.query(sql,[usuario]);
    return perfisEcontrados;
}


async function buscarPerfil(codigoPerfil)
{
    const conexao = await conectarBD();
    const sql = "select * from perfis where percodigo=?;";
    const [dadosEcontrados] = await conexao.query(sql,[codigoPerfil]);
    return dadosEcontrados[0];
}




conectarBD()

module.exports = { buscarUsuario, buscarPerfis, buscarPerfil }
