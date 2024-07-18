//Registro Controller
const UserModel = require("../models/user.model.js");
const jwt = require("jsonwebtoken");
const { createHash, isValidPassword } = require("../utils/hashbcrypt.js");
const CartsModel = require("../models/carts.model.js");
const { logger } = require("../utils/logger.js");
const bcrypt = require("bcrypt");
const EmailManager = require("../service/email.js");
const emailManager = new EmailManager();
const {generateResetToken} = require("../utils/resetoken.js");

class UserController {
    //Registro con JWT
    async registerJwt(req, res) {
        let { first_name, last_name, email, password, age } = req.body;

        try {
            //Verificar si el usuario existe en la bdd
            const existingUser = await UserModel.findOne({ email })

            //si es usuario existe
            if (existingUser) {
                req.logger.warning("El usuario ya existe")
                return res.status(400).send("El usuario ya existe")
            }

            //Creamos carrito asosiado al usuario y lo guardo
            const cart = new CartsModel()
            await cart.save();

            //si no existe lo creo
            const newUser = new UserModel({
                first_name,
                last_name,
                age,
                email,
                password: createHash(password),
                cart: cart._id,
            })

            //Lo guardo en la bdd
            await newUser.save();

            //Generamos el token
            const token = jwt.sign({
                first_name: newUser.first_name,
                last_name: newUser.last_name,
                email: newUser.email,
                age: newUser.age,
                role: newUser.role,
            }, "coderhouse", { expiresIn: "24h" });

            //Enviar token desde una cookie
            //                Clave        valor          tiempo     solo se accede desde http
            res.cookie("coderCookieToken", token, { maxAge: 60 * 60 * 1000, httpOnly: true });

            //una vez me registro me lleva al perfil
            res.redirect("/profile");

        } catch (error) {
            req.logger.error("Error interno del servidor", error)
            res.status(500).send("Error interno del servidor")
        }
    }


    //Login con JWT 
    async loginJwt(req, res) {
        let { email, password } = req.body;

        try {
            //verificacion si exite usuario con ese mail
            let user = await UserModel.findOne({ email });

            //Si no existe el usuario retorna error
            if (!user) {
                req.logger.warning("Este usuario no existe");
                return res.status(400).render("login", { errors: { email: "El usuario no está registrado" } });
            }

            //si existe verifico la contraseña
            if (!isValidPassword(password, user)) {
                req.logger.warning("Contraseña incorrecta");
                return res.status(400).render("login", { errors: { password: "Contraseña incorrecta" } });
            }

            //Generamos el token
            const token = jwt.sign(
                {
                    first_name: user.first_name,
                    last_name: user.last_name,
                    email: user.email,
                    age: user.age,
                    role: user.role,
                    cart: user.cart
                },
                "coderhouse",
                { expiresIn: "24h" }

            );

            //Establecer token como cookie 
            //                Clave        valor       tiempo, 1hr       la cookie  solo se accede desde http  
            res.cookie("coderCookieToken", token, { maxAge: 60 * 60 * 1000, httpOnly: true });
            res.redirect("/profile");

        } catch (error) {
            req.logger.error("Error interno del servidor", error)
            res.status(500).send("Error interno del servidor")
        }
    }

    //Cerrar sesion con JWT:
    async logoutJwt(req, res) {
        //limpio la cookie del token
        res.clearCookie("coderCookieToken");
        //Redirigir al login.
        res.redirect("/login");
    }

    //Version Github 
    async gitHub(req, res) {
        router.get("/githubcallback", passport.authenticate("github", {
            failureRedirect: "/login"
        }), async (req, res) => {
            //La estrategia de Github nos retornará el usuario, entonces los agrego a mi objeto de Session: 
            req.session.user = req.user;
            //habilita la ruta
            req.session.login = true;
            //Redirijo al perfil
            res.redirect("/profile");
        })
    }

    async githubCallback(req, res) {
        try {
            // La estrategia de Github nos retornará el usuario, entonces los agrego a mi objeto de Session: 
            req.session.user = req.user;
            // Habilita la ruta
            req.session.login = true;
            // Redirijo al perfil
            res.redirect("/profile");
        } catch (error) {
            req.error, logger('Error en el callback de GitHub:', error);
            res.status(500).send('Error interno del servidor');
        }
    };

    //Restablecer contraseña
    async resetPassword(req, res) {
        const { email } = req.body;
       
        try {
            //Busco el usuario por email en la bdd
            const user = await UserModel.findOne({ email });
            if (!user) {
                logger.error("No se encontró ningún usuario con el correo electrónico proporcionado.");
                return res.status(400).render("reset-password", { errors: { email: "El usuario no está registrado" } });
            }

            //Si hay usuario genero el token (utils)
            const resetToken = generateResetToken();
            const expireTime = new Date(Date.now() + 60 * 60 * 1000); //60 minutos a partir de ahora
            
            //Agrego el token y el tiempo de expiración al usuario
            user.resetToken = {
                token: resetToken,
                expire: expireTime
            }

            //Guardo en la bdd
            await user.save()

            //Despues de guardados los cambios envío el correo
            await emailManager.resetPasswordEmail(email, user, resetToken);

            //Redirijo a la vista confirmation
            res.redirect("/confirmation");

        } catch (error) {
            req.logger.error("Error interno del servidor", error)
            res.status(500).send("Error interno del servidor")
        }
    }

    //Cambiar contraseña
    async changePassword(req, res) {
        const { email, token, newPassword } = req.body;

        try {
            // Validamos si el email está registrado
            const user = await UserModel.findOne({ email });
            if (!user) {
                req.logger.error("No se encontró ningún usuario con el correo electrónico proporcionado.");
                return res.status(400).render("change-password", { errors: { email: "El usuario no está registrado" } });
            }

            //Si hay usuario:
            // Validamos si existe el token y el tiempo de expiración
            if (!user.resetToken || user.resetToken.token !== token || user.resetToken.expire < Date.now()) {
                req.logger.error("Token inválido o expirado");
                return res.status(400).render("change-password", {errors: { token: "Token inválido o expirado"}});
            }

            // Validamos que la contraseña no sea igual a la anterior
            const isPasswordValid = bcrypt.compareSync(newPassword, user.password);
            if (isPasswordValid) {
                req.logger.error("La contraseña no puede ser igual que la anterior");
               return res.status(400).render("change-password", { errors: {newPassword: "La contraseña no puede ser igual que la anterior"} });
            }

            // Restablecemos contraseña
            user.password = createHash(newPassword);

            // Limpiamos token y tiempo de expiración
            user.resetToken = null;

            // Guardamos en la base de datos
            await user.save();
            req.logger.info("Se restableció la contraseña correctamente");

            // Redirigimos al login
            return res.redirect("/login");

        } catch (error) {
            req.logger.error("Error interno del servidor", error);
            res.status(500).render("password-error", { errors: "Error interno del servidor" });
        }
    }
}


module.exports = UserController;