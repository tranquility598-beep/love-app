const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.NODE_ENV === 'production' 
      ? process.env.PROD_GOOGLE_CALLBACK_URL 
      : process.env.GOOGLE_CALLBACK_URL,
    passReqToCallback: true
  },
  async (req, accessToken, refreshToken, profile, done) => {
    try {
      // Пытаемся найти пользователя по googleId
      let user = await User.findOne({ googleId: profile.id });
      
      if (user) {
        return done(null, user);
      }
      
      // Если не нашли по googleId, ищем по email (может он уже регался через почту)
      const userEmail = profile.emails[0].value;
      user = await User.findOne({ email: userEmail.toLowerCase() });
      
      if (user) {
        // Связываем существующий аккаунт с Google
        user.googleId = profile.id;
        if (!user.avatar) user.avatar = profile.photos[0].value;
        await user.save();
        return done(null, user);
      }
      
      // Если пользователя нет совсем — создаем нового
      const newUser = new User({
        username: profile.displayName || `user${profile.id.substring(0, 5)}`,
        email: userEmail.toLowerCase(),
        googleId: profile.id,
        avatar: profile.photos[0].value,
        status: 'online',
        role: 'user'
      });
      
      // Если это самый первый пользователь в БД — делаем его владельцем
      const userCount = await User.countDocuments();
      if (userCount === 0) newUser.role = 'owner';
      
      await newUser.save();
      done(null, newUser);
    } catch (error) {
      console.error('Google Strategy Error:', error);
      done(error, null);
    }
  }
));

// Эти методы не обязательны, так как мы используем JWT вместо сессий, 
// но passport может ругаться если их нет
passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => {
  User.findById(id).then(user => done(null, user));
});

module.exports = passport;
