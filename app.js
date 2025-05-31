const express = require('express');
const mysql = require('mysql2');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const multer = require('multer');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const path = require('path');
const flash = require('express-flash');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Configuração do banco de dados
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

// ✅ CONFIGURAÇÃO CORRETA DO NODEMAILER:
const transport = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Verificar configuração do email (opcional)
transport.verify(function(error, success) {
    if (error) {
        console.log('❌ Erro na configuração do email:', error);
        console.log('💡 Verifique suas credenciais no arquivo .env');
    } else {
        console.log('✅ Servidor de email configurado corretamente');
    }
});

// Configuração do Multer para upload de arquivos
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB
    },
    fileFilter: function (req, file, cb) {
        const allowedTypes = /jpeg|jpg|png|gif/;
        const mimetype = allowedTypes.test(file.mimetype);
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Apenas imagens são permitidas!'));
        }
    }
});

// Middleware
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
}));
app.use(flash());

// Middleware para variáveis globais
app.use((req, res, next) => {
    res.locals.user = req.session.user;
    res.locals.messages = req.flash();
    next();
});

// Middleware de autenticação
const requireAuth = (req, res, next) => {
    if (req.session.user) {
        next();
    } else {
        res.redirect('/login');
    }
};

// Criar tabelas do banco de dados
const createTables = () => {
    const tables = [
        `CREATE TABLE IF NOT EXISTS usuarios (
            id INT AUTO_INCREMENT PRIMARY KEY,
            nome VARCHAR(100) NOT NULL,
            email VARCHAR(100) UNIQUE NOT NULL,
            senha VARCHAR(255) NOT NULL,
            foto_perfil VARCHAR(255),
            verificado BOOLEAN DEFAULT FALSE,
            token_verificacao VARCHAR(255),
            dark_mode BOOLEAN DEFAULT FALSE,
            criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )`,
        
        `CREATE TABLE IF NOT EXISTS categorias (
            id INT AUTO_INCREMENT PRIMARY KEY,
            nome VARCHAR(50) NOT NULL UNIQUE,
            descricao TEXT,
            icone VARCHAR(50),
            cor VARCHAR(7) DEFAULT '#6366f1'
        )`,
        
        `CREATE TABLE IF NOT EXISTS usuario_categorias (
            id INT AUTO_INCREMENT PRIMARY KEY,
            usuario_id INT,
            categoria_id INT,
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
            FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE CASCADE,
            UNIQUE KEY unique_user_category (usuario_id, categoria_id)
        )`,
        
        `CREATE TABLE IF NOT EXISTS noticias (
            id INT AUTO_INCREMENT PRIMARY KEY,
            titulo VARCHAR(255) NOT NULL,
            subtitulo TEXT,
            conteudo TEXT NOT NULL,
            imagem VARCHAR(255),
            categoria_id INT,
            autor VARCHAR(100),
            fonte VARCHAR(100),
            url_externa VARCHAR(500),
            visualizacoes INT DEFAULT 0,
            criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (categoria_id) REFERENCES categorias(id)
        )`,

        // Tabelas avançadas
        `CREATE TABLE IF NOT EXISTS favoritos (
            id INT AUTO_INCREMENT PRIMARY KEY,
            usuario_id INT NOT NULL,
            noticia_id INT NOT NULL,
            criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
            FOREIGN KEY (noticia_id) REFERENCES noticias(id) ON DELETE CASCADE,
            UNIQUE KEY unique_favorito (usuario_id, noticia_id)
        )`,
        
        `CREATE TABLE IF NOT EXISTS notificacoes (
            id INT AUTO_INCREMENT PRIMARY KEY,
            usuario_id INT NOT NULL,
            titulo VARCHAR(255) NOT NULL,
            mensagem TEXT,
            tipo ENUM('noticia', 'sistema', 'categoria') DEFAULT 'noticia',
            lida BOOLEAN DEFAULT FALSE,
            dados JSON,
            criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
        )`,
        
        `CREATE TABLE IF NOT EXISTS analytics (
            id INT AUTO_INCREMENT PRIMARY KEY,
            usuario_id INT,
            evento VARCHAR(100) NOT NULL,
            pagina VARCHAR(255),
            dados JSON,
            ip VARCHAR(45),
            user_agent TEXT,
            criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
        )`
    ];

    tables.forEach(table => {
        db.query(table, (err) => {
            if (err) console.error('Erro ao criar tabela:', err);
        });
    });

    // Inserir categorias padrão
    const categoriasPadrao = [
        { nome: 'Esportes', descricao: 'Notícias esportivas', icone: '⚽', cor: '#10b981' },
        { nome: 'Política', descricao: 'Notícias políticas', icone: '🏛️', cor: '#ef4444' },
        { nome: 'Finanças', descricao: 'Mercado financeiro', icone: '💰', cor: '#f59e0b' },
        { nome: 'Tecnologia', descricao: 'Inovação e tech', icone: '💻', cor: '#3b82f6' },
        { nome: 'Saúde', descricao: 'Saúde e bem-estar', icone: '🏥', cor: '#06b6d4' },
        { nome: 'Entretenimento', descricao: 'Cinema, música, celebridades', icone: '🎬', cor: '#8b5cf6' },
        { nome: 'Ciência', descricao: 'Descobertas científicas', icone: '🔬', cor: '#059669' },
        { nome: 'Educação', descricao: 'Ensino e educação', icone: '📚', cor: '#dc2626' },
        { nome: 'Meio Ambiente', descricao: 'Sustentabilidade e natureza', icone: '🌱', cor: '#16a34a' },
        { nome: 'Internacional', descricao: 'Notícias internacionais', icone: '🌍', cor: '#7c3aed' }
    ];

    categoriasPadrao.forEach(categoria => {
        db.query(
            'INSERT IGNORE INTO categorias (nome, descricao, icone, cor) VALUES (?, ?, ?, ?)',
            [categoria.nome, categoria.descricao, categoria.icone, categoria.cor]
        );
    });
};

// ROTAS

// Página inicial
app.get('/', (req, res) => {
    const query = `
        SELECT n.*, c.nome as categoria_nome, c.cor as categoria_cor 
        FROM noticias n 
        LEFT JOIN categorias c ON n.categoria_id = c.id 
        ORDER BY n.criado_em DESC 
        LIMIT 12
    `;
    
    db.query(query, (err, noticias) => {
        if (err) {
            console.error(err);
            return res.render('index', { noticias: [] });
        }
        res.render('index', { noticias });
    });
});

// Cadastro
app.get('/cadastro', (req, res) => {
    res.render('cadastro');
});

app.post('/cadastro', async (req, res) => {
    try {
        const { nome, email, senha, confirmarSenha } = req.body;

        // Validações básicas
        if (!nome || !email || !senha || !confirmarSenha) {
            req.flash('error', 'Todos os campos são obrigatórios');
            return res.redirect('/cadastro');
        }

        if (senha !== confirmarSenha) {
            req.flash('error', 'As senhas não coincidem');
            return res.redirect('/cadastro');
        }

        if (senha.length < 6) {
            req.flash('error', 'A senha deve ter pelo menos 6 caracteres');
            return res.redirect('/cadastro');
        }

        // Verificar se o email já existe
        const checkEmailQuery = 'SELECT id FROM usuarios WHERE email = ?';
        const existingUser = await new Promise((resolve, reject) => {
            db.query(checkEmailQuery, [email], (err, results) => {
                if (err) reject(err);
                else resolve(results);
            });
        });

        if (existingUser.length > 0) {
            req.flash('error', 'Este email já está cadastrado');
            return res.redirect('/cadastro');
        }

        const hashedPassword = await bcrypt.hash(senha, 12);
        const verificationToken = crypto.randomBytes(32).toString('hex');

        // Inserir usuário
        const insertUserQuery = 'INSERT INTO usuarios (nome, email, senha, token_verificacao) VALUES (?, ?, ?, ?)';
        await new Promise((resolve, reject) => {
            db.query(insertUserQuery, [nome, email, hashedPassword, verificationToken], (err, result) => {
                if (err) reject(err);
                else resolve(result);
            });
        });

        // Tentar enviar email de verificação
        try {
            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: email,
                subject: 'Confirme seu cadastro - Portal de Notícias',
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2 style="color: #6366f1;">Bem-vindo ao Portal de Notícias!</h2>
                        <p>Olá ${nome},</p>
                        <p>Obrigado por se cadastrar! Para ativar sua conta, clique no link abaixo:</p>
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="http://localhost:3000/verificar/${verificationToken}" 
                               style="background-color: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
                                Confirmar Cadastro
                            </a>
                        </div>
                        <p>Se você não solicitou este cadastro, pode ignorar este email.</p>
                        <p>Atenciosamente,<br>Equipe Portal de Notícias</p>
                    </div>
                `
            };

            await transport.sendMail(mailOptions);
            req.flash('success', 'Cadastro realizado com sucesso! Verifique seu email para ativar a conta.');
        } catch (emailErr) {
            console.error('Erro ao enviar email:', emailErr);
            req.flash('warning', 'Cadastro realizado, mas não foi possível enviar o email de confirmação. Entre em contato com o suporte.');
        }

        res.redirect('/login');

    } catch (error) {
        console.error('Erro no cadastro:', error);
        req.flash('error', 'Erro interno do servidor. Tente novamente.');
        res.redirect('/cadastro');
    }
});

// Verificação de email
app.get('/verificar/:token', async (req, res) => {
    try {
        const { token } = req.params;

        if (!token) {
            req.flash('error', 'Token de verificação inválido');
            return res.redirect('/login');
        }

        const updateQuery = 'UPDATE usuarios SET verificado = TRUE, token_verificacao = NULL WHERE token_verificacao = ?';
        const result = await new Promise((resolve, reject) => {
            db.query(updateQuery, [token], (err, result) => {
                if (err) reject(err);
                else resolve(result);
            });
        });

        if (result.affectedRows === 0) {
            req.flash('error', 'Token inválido ou expirado');
            return res.redirect('/login');
        }

        req.flash('success', 'Email verificado com sucesso! Você já pode fazer login.');
        res.redirect('/login');

    } catch (error) {
        console.error('Erro na verificação:', error);
        req.flash('error', 'Erro ao verificar email. Tente novamente.');
        res.redirect('/login');
    }
});

// Login
app.get('/login', (req, res) => {
    res.render('login');
});

app.post('/login', async (req, res) => {
    try {
        const { email, senha } = req.body;

        if (!email || !senha) {
            req.flash('error', 'Email e senha são obrigatórios');
            return res.redirect('/login');
        }

        const userQuery = 'SELECT * FROM usuarios WHERE email = ?';
        const users = await new Promise((resolve, reject) => {
            db.query(userQuery, [email], (err, results) => {
                if (err) reject(err);
                else resolve(results);
            });
        });

        if (users.length === 0) {
            req.flash('error', 'Email ou senha incorretos');
            return res.redirect('/login');
        }

        const user = users[0];

        if (!user.verificado) {
            req.flash('error', 'Por favor, verifique seu email antes de fazer login. Verifique sua caixa de entrada e spam.');
            return res.redirect('/login');
        }

        const isValidPassword = await bcrypt.compare(senha, user.senha);
        if (!isValidPassword) {
            req.flash('error', 'Email ou senha incorretos');
            return res.redirect('/login');
        }

        req.session.user = {
            id: user.id,
            nome: user.nome,
            email: user.email,
            foto_perfil: user.foto_perfil
        };

        // Verificar se é o primeiro login
        const categoryQuery = 'SELECT COUNT(*) as count FROM usuario_categorias WHERE usuario_id = ?';
        const categoryCount = await new Promise((resolve, reject) => {
            db.query(categoryQuery, [user.id], (err, results) => {
                if (err) reject(err);
                else resolve(results);
            });
        });

        if (categoryCount[0].count === 0) {
            res.redirect('/selecionar-categorias');
        } else {
            res.redirect('/dashboard');
        }

    } catch (error) {
        console.error('Erro no login:', error);
        req.flash('error', 'Erro interno do servidor. Tente novamente.');
        res.redirect('/login');
    }
});

// Seleção de categorias (primeiro acesso)
app.get('/selecionar-categorias', requireAuth, (req, res) => {
    db.query('SELECT * FROM categorias ORDER BY nome', (err, categorias) => {
        if (err) {
            console.error(err);
            return res.redirect('/dashboard');
        }
        res.render('selecionar-categorias', { categorias, isFirstAccess: true });
    });
});

app.post('/selecionar-categorias', requireAuth, (req, res) => {
    const { categorias } = req.body;
    const userId = req.session.user.id;

    if (!categorias || categorias.length === 0) {
        req.flash('error', 'Selecione pelo menos uma categoria');
        return res.redirect('/selecionar-categorias');
    }

    // Remover categorias existentes
    db.query('DELETE FROM usuario_categorias WHERE usuario_id = ?', [userId], (err) => {
        if (err) {
            console.error(err);
            req.flash('error', 'Erro ao salvar preferências');
            return res.redirect('/selecionar-categorias');
        }

        // Inserir novas categorias
        const categoriasArray = Array.isArray(categorias) ? categorias : [categorias];
        const values = categoriasArray.map(catId => [userId, catId]);

        if (values.length > 0) {
            db.query(
                'INSERT INTO usuario_categorias (usuario_id, categoria_id) VALUES ?',
                [values],
                (err) => {
                    if (err) {
                        console.error(err);
                        req.flash('error', 'Erro ao salvar preferências');
                        return res.redirect('/selecionar-categorias');
                    }

                    req.flash('success', 'Preferências salvas com sucesso!');
                    res.redirect('/dashboard');
                }
            );
        }
    });
});

// Dashboard
app.get('/dashboard', requireAuth, (req, res) => {
    const userId = req.session.user.id;

    const query = `
        SELECT n.*, c.nome as categoria_nome, c.cor as categoria_cor 
        FROM noticias n 
        LEFT JOIN categorias c ON n.categoria_id = c.id 
        WHERE n.categoria_id IN (
            SELECT categoria_id FROM usuario_categorias WHERE usuario_id = ?
        )
        ORDER BY n.criado_em DESC 
        LIMIT 20
    `;

    db.query(query, [userId], (err, noticias) => {
        if (err) {
            console.error(err);
            return res.render('dashboard', { noticias: [] });
        }
        res.render('dashboard', { noticias });
    });
});

// Perfil
app.get('/perfil', requireAuth, (req, res) => {
    const userId = req.session.user.id;

    const query = `
        SELECT c.*, 
               CASE WHEN uc.categoria_id IS NOT NULL THEN 1 ELSE 0 END as selecionada
        FROM categorias c 
        LEFT JOIN usuario_categorias uc ON c.id = uc.categoria_id AND uc.usuario_id = ?
        ORDER BY c.nome
    `;

    db.query(query, [userId], (err, categorias) => {
        if (err) {
            console.error(err);
            return res.render('perfil', { categorias: [] });
        }
        res.render('perfil', { categorias });
    });
});

// Upload de foto de perfil
app.post('/upload-foto', requireAuth, upload.single('foto'), (req, res) => {
    if (!req.file) {
        req.flash('error', 'Nenhuma foto foi selecionada');
        return res.redirect('/perfil');
    }

    const userId = req.session.user.id;
    const fotoPath = `/uploads/${req.file.filename}`;

    db.query(
        'UPDATE usuarios SET foto_perfil = ? WHERE id = ?',
        [fotoPath, userId],
        (err) => {
            if (err) {
                console.error(err);
                req.flash('error', 'Erro ao salvar foto');
                return res.redirect('/perfil');
            }

            req.session.user.foto_perfil = fotoPath;
            req.flash('success', 'Foto atualizada com sucesso!');
            res.redirect('/perfil');
        }
    );
});

// Atualizar categorias do perfil
app.post('/atualizar-categorias', requireAuth, (req, res) => {
    const { categorias } = req.body;
    const userId = req.session.user.id;

    // Remover categorias existentes
    db.query('DELETE FROM usuario_categorias WHERE usuario_id = ?', [userId], (err) => {
        if (err) {
            console.error(err);
            req.flash('error', 'Erro ao atualizar preferências');
            return res.redirect('/perfil');
        }

        // Inserir novas categorias se houver
        if (categorias && categorias.length > 0) {
            const categoriasArray = Array.isArray(categorias) ? categorias : [categorias];
            const values = categoriasArray.map(catId => [userId, catId]);

            db.query(
                'INSERT INTO usuario_categorias (usuario_id, categoria_id) VALUES ?',
                [values],
                (err) => {
                    if (err) {
                        console.error(err);
                        req.flash('error', 'Erro ao atualizar preferências');
                        return res.redirect('/perfil');
                    }

                    req.flash('success', 'Preferências atualizadas com sucesso!');
                    res.redirect('/perfil');
                }
            );
        } else {
            req.flash('success', 'Preferências atualizadas com sucesso!');
            res.redirect('/perfil');
        }
    });
});

// SUBSTITUA a rota app.post('/login') no seu app.js por esta versão:

app.post('/login', async (req, res) => {
    console.log('\n🔐 === INICIANDO PROCESSO DE LOGIN ===');
    console.log('📊 Dados recebidos:', req.body);
    console.log('🌐 IP do cliente:', req.ip);
    console.log('📱 User-Agent:', req.get('User-Agent'));

    try {
        const { email, senha } = req.body;

        // Validação básica
        console.log('1️⃣ Validando dados básicos...');
        if (!email || !senha) {
            console.log('❌ Campos obrigatórios não preenchidos');
            console.log('   Email:', email ? '✅' : '❌');
            console.log('   Senha:', senha ? '✅' : '❌');
            req.flash('error', 'Email e senha são obrigatórios');
            return res.redirect('/login');
        }
        console.log('✅ Dados básicos validados');

        // Buscar usuário
        console.log('2️⃣ Buscando usuário no banco de dados...');
        console.log('   Email de busca:', email.trim());
        
        const userQuery = 'SELECT * FROM usuarios WHERE email = ?';
        const users = await new Promise((resolve, reject) => {
            db.query(userQuery, [email.trim()], (err, results) => {
                if (err) {
                    console.error('💥 Erro na consulta SQL:', err);
                    reject(err);
                } else {
                    console.log('📊 Resultados da busca:', results.length, 'usuário(s) encontrado(s)');
                    resolve(results);
                }
            });
        });

        if (users.length === 0) {
            console.log('❌ Nenhum usuário encontrado com este email');
            req.flash('error', 'Email ou senha incorretos');
            return res.redirect('/login');
        }
        
        const user = users[0];
        console.log('✅ Usuário encontrado:');
        console.log('   ID:', user.id);
        console.log('   Nome:', user.nome);
        console.log('   Email:', user.email);
        console.log('   Verificado:', user.verificado ? 'SIM ✅' : 'NÃO ❌');
        console.log('   Hash da senha:', user.senha.substring(0, 20) + '...');

        // Verificar se o usuário está verificado
        console.log('3️⃣ Verificando status de verificação...');
        if (!user.verificado) {
            console.log('❌ Usuário não verificado - login bloqueado');
            req.flash('error', 'Por favor, verifique seu email antes de fazer login. Verifique sua caixa de entrada e spam.');
            return res.redirect('/login');
        }
        console.log('✅ Usuário verificado');

        // Verificar senha
        console.log('4️⃣ Verificando senha...');
        console.log('   Senha fornecida:', '[' + senha.length + ' caracteres]');
        console.log('   Hash no banco:', user.senha.substring(0, 20) + '...');
        
        const isValidPassword = await bcrypt.compare(senha, user.senha);
        console.log('   Resultado da comparação:', isValidPassword ? 'VÁLIDA ✅' : 'INVÁLIDA ❌');
        
        if (!isValidPassword) {
            console.log('❌ Senha incorreta - login negado');
            req.flash('error', 'Email ou senha incorretos');
            return res.redirect('/login');
        }
        console.log('✅ Senha verificada com sucesso');

        // Criar sessão
        console.log('5️⃣ Criando sessão do usuário...');
        req.session.user = {
            id: user.id,
            nome: user.nome,
            email: user.email,
            foto_perfil: user.foto_perfil
        };
        console.log('✅ Sessão criada:', req.session.user);

        // Verificar categorias (primeiro acesso)
        console.log('6️⃣ Verificando categorias do usuário...');
        const categoryQuery = 'SELECT COUNT(*) as count FROM usuario_categorias WHERE usuario_id = ?';
        const categoryCount = await new Promise((resolve, reject) => {
            db.query(categoryQuery, [user.id], (err, results) => {
                if (err) {
                    console.error('💥 Erro ao verificar categorias:', err);
                    reject(err);
                } else {
                    console.log('📊 Resultado da consulta de categorias:', results);
                    resolve(results);
                }
            });
        });

        const totalCategorias = categoryCount[0].count;
        console.log('   Total de categorias do usuário:', totalCategorias);

        if (totalCategorias === 0) {
            console.log('🎯 PRIMEIRO ACESSO - Redirecionando para seleção de categorias');
            req.flash('success', 'Login realizado com sucesso! Agora selecione suas categorias de interesse.');
            console.log('🔀 Redirecionando para: /selecionar-categorias');
            res.redirect('/selecionar-categorias');
        } else {
            console.log('🏠 USUÁRIO JÁ CONFIGURADO - Redirecionando para dashboard');
            req.flash('success', `Bem-vindo de volta, ${user.nome}!`);
            console.log('🔀 Redirecionando para: /dashboard');
            res.redirect('/dashboard');
        }

        console.log('✅ === LOGIN CONCLUÍDO COM SUCESSO ===\n');

    } catch (error) {
        console.error('💥 === ERRO NO PROCESSO DE LOGIN ===');
        console.error('Erro completo:', error);
        console.error('Stack trace:', error.stack);
        req.flash('error', 'Erro interno do servidor. Tente novamente.');
        res.redirect('/login');
    }
});

// Função para criar notificação
function criarNotificacao(userId, titulo, mensagem, tipo = 'sistema', dados = null) {
    db.query(
        'INSERT INTO notificacoes (usuario_id, titulo, mensagem, tipo, dados) VALUES (?, ?, ?, ?, ?)',
        [userId, titulo, mensagem, tipo, JSON.stringify(dados)],
        (err) => {
            if (err) console.error('Erro ao criar notificação:', err);
        }
    );
}

// ============================================
// ROTAS DO PERFIL - Adicione no seu app.js
// ============================================

// ROTA: Exibir página de perfil
app.get('/perfil', requireAuth, (req, res) => {
    console.log('👤 Acessando página de perfil para usuário:', req.session.user.id);
    
    const userId = req.session.user.id;

    const query = `
        SELECT c.*, 
               CASE WHEN uc.categoria_id IS NOT NULL THEN 1 ELSE 0 END as selecionada
        FROM categorias c 
        LEFT JOIN usuario_categorias uc ON c.id = uc.categoria_id AND uc.usuario_id = ?
        ORDER BY c.nome
    `;

    db.query(query, [userId], (err, categorias) => {
        if (err) {
            console.error('❌ Erro ao buscar categorias:', err);
            return res.render('perfil', { categorias: [] });
        }
        
        console.log('✅ Categorias carregadas:', categorias.length);
        res.render('perfil', { categorias });
    });
});

// ROTA: Atualizar dados pessoais (nome)
app.post('/atualizar-perfil', requireAuth, async (req, res) => {
    console.log('✏️ Atualizando dados do perfil...');
    
    try {
        const { nome } = req.body;
        const userId = req.session.user.id;
        
        console.log('📝 Dados recebidos:', { nome, userId });

        // Validações
        if (!nome || nome.trim().length < 2) {
            req.flash('error', 'Nome deve ter pelo menos 2 caracteres');
            return res.redirect('/perfil');
        }

        // Atualizar no banco
        const updateQuery = 'UPDATE usuarios SET nome = ?, atualizado_em = NOW() WHERE id = ?';
        await new Promise((resolve, reject) => {
            db.query(updateQuery, [nome.trim(), userId], (err, result) => {
                if (err) {
                    console.error('❌ Erro ao atualizar perfil:', err);
                    reject(err);
                } else {
                    console.log('✅ Perfil atualizado:', result.affectedRows, 'linha(s)');
                    resolve(result);
                }
            });
        });

        // Atualizar sessão
        req.session.user.nome = nome.trim();
        
        req.flash('success', 'Dados pessoais atualizados com sucesso!');
        console.log('✅ Perfil atualizado com sucesso');
        res.redirect('/perfil');

    } catch (error) {
        console.error('💥 Erro ao atualizar perfil:', error);
        req.flash('error', 'Erro ao atualizar dados. Tente novamente.');
        res.redirect('/perfil');
    }
});

// ROTA: Alterar senha
app.post('/alterar-senha', requireAuth, async (req, res) => {
    console.log('🔐 Alterando senha do usuário...');
    
    try {
        const { senhaAtual, novaSenha, confirmarSenha } = req.body;
        const userId = req.session.user.id;
        
        console.log('📝 Tentativa de alteração de senha para usuário:', userId);

        // Validações básicas
        if (!senhaAtual || !novaSenha || !confirmarSenha) {
            req.flash('error', 'Todos os campos são obrigatórios');
            return res.redirect('/perfil');
        }

        if (novaSenha !== confirmarSenha) {
            req.flash('error', 'Nova senha e confirmação não coincidem');
            return res.redirect('/perfil');
        }

        if (novaSenha.length < 6) {
            req.flash('error', 'Nova senha deve ter pelo menos 6 caracteres');
            return res.redirect('/perfil');
        }

        // Buscar usuário atual
        const userQuery = 'SELECT * FROM usuarios WHERE id = ?';
        const user = await new Promise((resolve, reject) => {
            db.query(userQuery, [userId], (err, results) => {
                if (err) {
                    console.error('❌ Erro ao buscar usuário:', err);
                    reject(err);
                } else if (results.length === 0) {
                    reject(new Error('Usuário não encontrado'));
                } else {
                    resolve(results[0]);
                }
            });
        });

        // Verificar senha atual
        console.log('🔍 Verificando senha atual...');
        const senhaAtualCorreta = await bcrypt.compare(senhaAtual, user.senha);
        
        if (!senhaAtualCorreta) {
            console.log('❌ Senha atual incorreta');
            req.flash('error', 'Senha atual incorreta');
            return res.redirect('/perfil');
        }

        // Gerar hash da nova senha
        console.log('🔐 Gerando hash da nova senha...');
        const novoHash = await bcrypt.hash(novaSenha, 12);

        // Atualizar no banco
        const updateQuery = 'UPDATE usuarios SET senha = ?, atualizado_em = NOW() WHERE id = ?';
        await new Promise((resolve, reject) => {
            db.query(updateQuery, [novoHash, userId], (err, result) => {
                if (err) {
                    console.error('❌ Erro ao atualizar senha:', err);
                    reject(err);
                } else {
                    console.log('✅ Senha atualizada:', result.affectedRows, 'linha(s)');
                    resolve(result);
                }
            });
        });

        req.flash('success', 'Senha alterada com sucesso!');
        console.log('✅ Senha alterada com sucesso para usuário:', userId);
        res.redirect('/perfil');

    } catch (error) {
        console.error('💥 Erro ao alterar senha:', error);
        req.flash('error', 'Erro ao alterar senha. Tente novamente.');
        res.redirect('/perfil');
    }
});

// ROTA: Upload de foto de perfil (melhorada)
app.post('/upload-foto', requireAuth, upload.single('foto'), (req, res) => {
    console.log('📸 Upload de foto de perfil...');
    
    if (!req.file) {
        console.log('❌ Nenhuma foto selecionada');
        req.flash('error', 'Nenhuma foto foi selecionada');
        return res.redirect('/perfil');
    }

    const userId = req.session.user.id;
    const fotoPath = `/uploads/${req.file.filename}`;
    
    console.log('📁 Arquivo enviado:', {
        filename: req.file.filename,
        size: req.file.size,
        mimetype: req.file.mimetype
    });

    db.query(
        'UPDATE usuarios SET foto_perfil = ?, atualizado_em = NOW() WHERE id = ?',
        [fotoPath, userId],
        (err) => {
            if (err) {
                console.error('❌ Erro ao salvar foto:', err);
                req.flash('error', 'Erro ao salvar foto');
                return res.redirect('/perfil');
            }

            // Atualizar sessão
            req.session.user.foto_perfil = fotoPath;
            
            console.log('✅ Foto de perfil atualizada:', fotoPath);
            req.flash('success', 'Foto de perfil atualizada com sucesso!');
            res.redirect('/perfil');
        }
    );
});

// ROTA: Atualizar categorias (melhorada)
app.post('/atualizar-categorias', requireAuth, (req, res) => {
    console.log('🏷️ Atualizando categorias do usuário...');
    
    const { categorias } = req.body;
    const userId = req.session.user.id;
    
    console.log('📊 Categorias recebidas:', categorias);
    console.log('👤 Usuário ID:', userId);

    // Remover categorias existentes
    db.query('DELETE FROM usuario_categorias WHERE usuario_id = ?', [userId], (err) => {
        if (err) {
            console.error('❌ Erro ao remover categorias existentes:', err);
            req.flash('error', 'Erro ao atualizar preferências');
            return res.redirect('/perfil');
        }

        console.log('🗑️ Categorias existentes removidas');

        // Inserir novas categorias se houver
        if (categorias && categorias.length > 0) {
            const categoriasArray = Array.isArray(categorias) ? categorias : [categorias];
            const values = categoriasArray.map(catId => [userId, catId]);
            
            console.log('📝 Inserindo categorias:', values);

            db.query(
                'INSERT INTO usuario_categorias (usuario_id, categoria_id) VALUES ?',
                [values],
                (err) => {
                    if (err) {
                        console.error('❌ Erro ao inserir novas categorias:', err);
                        req.flash('error', 'Erro ao atualizar preferências');
                        return res.redirect('/perfil');
                    }

                    console.log('✅ Categorias atualizadas:', categoriasArray.length, 'categoria(s)');
                    req.flash('success', `Preferências atualizadas! ${categoriasArray.length} categoria(s) selecionada(s).`);
                    res.redirect('/perfil');
                }
            );
        } else {
            console.log('📭 Nenhuma categoria selecionada');
            req.flash('warning', 'Nenhuma categoria foi selecionada. Você pode não receber notícias personalizadas.');
            res.redirect('/perfil');
        }
    });
});

// ROTA: API para buscar dados do usuário (para AJAX se necessário)
app.get('/api/perfil', requireAuth, (req, res) => {
    const userId = req.session.user.id;
    
    const query = `
        SELECT 
            u.id, u.nome, u.email, u.foto_perfil, u.criado_em,
            COUNT(uc.id) as total_categorias
        FROM usuarios u
        LEFT JOIN usuario_categorias uc ON u.id = uc.usuario_id
        WHERE u.id = ?
        GROUP BY u.id
    `;

    db.query(query, [userId], (err, results) => {
        if (err) {
            console.error('❌ Erro ao buscar dados do perfil:', err);
            return res.status(500).json({ error: 'Erro interno do servidor' });
        }

        if (results.length === 0) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }

        const userData = results[0];
        res.json({
            id: userData.id,
            nome: userData.nome,
            email: userData.email,
            foto_perfil: userData.foto_perfil,
            criado_em: userData.criado_em,
            total_categorias: userData.total_categorias
        });
    });
});

console.log('✅ Rotas do perfil configuradas com sucesso!');

// Logout
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error(err);
        }
        res.redirect('/');
    });
});

// Inicializar servidor
db.connect((err) => {
    if (err) {
        console.error('Erro ao conectar com o banco de dados:', err);
        return;
    }
    console.log('✅ Conectado ao MySQL');
    createTables();
    console.log('✅ Tabelas criadas/verificadas');
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    console.log(`🌐 Acesse: http://localhost:${PORT}`);
    console.log('📝 Cadastro: http://localhost:3000/cadastro');
    console.log('🔑 Login: http://localhost:3000/login');
});