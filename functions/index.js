const functions = require('firebase-functions');
const admin = require('firebase-admin');
const app = require('express')();

var serviceAccount = require("./admin.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://socialape-be6ca.firebaseio.com"
});

const config = {
  apiKey: "AIzaSyCPbD9WlzzQEkkRmEdQqRIUAcEoFGOkoXk",
  authDomain: "socialape-be6ca.firebaseapp.com",
  databaseURL: "https://socialape-be6ca.firebaseio.com",
  projectId: "socialape-be6ca",
  storageBucket: "socialape-be6ca.appspot.com",
  messagingSenderId: "311747042575",
  appId: "1:311747042575:web:2b0105194cf8a27eabf27a"
};

const firebase = require('firebase');
const { user } = require('firebase-functions/lib/providers/auth');
firebase.initializeApp(config);

const db = admin.firestore();

app.get('/screams', (req,res) => {
  db.firestore().collection('screams').orderBy('createdAt', 'desc').get()
    .then(data => {
      let screams = [];
      data.forEach(doc => {
        screams.push({
          screamId: doc.id,
          body: doc.data().body,
          userHandle: doc.data().userHandle,
          createdAt: doc.data().createdAt
        })
      })
      return res.json(screams);
    })
    .catch(err => console.error(err))
})

const FBAuth = (req,res,next) => {
   let idToken;
   if(req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
     idToken = req.headers.authorization.split('Bearer ')[1]
   } else {
     console.error('No token found');
     return res.status(403).json({ error: 'Unauthorized'})
   }

   admin.auth().verifyIdToken(idToken)
      .then(decodedToken => {
        req.user = decodedToken;
        console.log(decodedToken);
        return db.collection('users')
          .where('userId', '==', req.user.uid)
          .limit(1)
          .get();
      }).then(data => {
        req.user.handle = data.docs[0].data().handle;
        return next();
      }).catch(err => {
        console.error('Error while verfiying token', err);
        return res.status(403).json(err);
      })
}
 
app.post('/scream', FBAuth, (req,res) => {
  const newScream = {
    body: req.body.body,
    userHandle: req.user.handle,
    createdAt: new Date().toISOString()
  }

  db
    .collection('screams')
    .add(newScream)
    .then(doc => {
      res.json({ message: `document ${doc.id} created successfully`});
    })
    .catch(err => {
      res.status(500).json({ error: `something went wrong`});
      console.error(err);
    })
})

//Helper Method
const isEmail = email => {
  const regEx = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
  if(email.match(regEx)) return true;
  else return false;
}

const isEmpty = string => {
  if(string.trim() === '') return true;
  else return false;
}

//Signup route
app.post('/signup', (req,res) => {
   const newUser = {
     email: req.body.email,
     password: req.body.password,
     confirmPassword: req.body.confirmPassword,
     handle: req.body.handle
   };
   
   let errors = {};

   if(isEmpty(newUser.email)) {
     errors.email = 'Must not be empty'
   } else if (!isEmail(newUser.email)) {
     errors.email = 'Must be a valid email address'
   }

   if(isEmpty(newUser.password)) errors.password = 'Must not be empty'

   if(newUser.password !== newUser.confirmPassword) errors.confirmPassword = 'Password must match'
   
   if(isEmpty(newUser.handle)) errors.handle = 'Must not bt empty';

   if(Object.keys(errors).length > 0 ) return res.status(400).json(errors);

  //TODO validate data
  let token, userId;
  db.doc(`/users/${newUser.handle}`).get()
   .then(doc => {
     if(doc.exists) {
       return res.status(400).json({ handle: 'this handle is already taken'});
     } else {
      return firebase.auth().createUserWithEmailAndPassword(newUser.email, newUser.password)
     }
   }).then(data => {
     userId = data.user.uid;
     return data.user.getIdToken();
   }).then(idToken => {
     token = idToken;
     const userCredentials = {
       handle: newUser.handle,
       email: newUser.email,
       createdAt: new Date().toISOString(),
       userId
     };
     db.doc(`/users/${newUser.handle}`).set(userCredentials)
   }).then(() => {
     return res.status(201).json({ token });
   }).catch(err => {
     console.error(err);
     if(err.code === 'auth/email-already-in-use') {
       return res.status(400).json({ email: 'Email is already is use'})
     } else {
      return res.status(500).json({ error: err.code});
     }
     
   })
})

app.post('/login', (req,res) => {
  const user = {
    email: req.body.email,
    password: req.body.password
  }

  let errors = {};

  if(isEmpty(user.email)) {
    errors.email = 'Must not be empty'
  } else if (!isEmail(user.email)) {
    errors.email = 'Must be a valid email address'
  }
  if(isEmpty(user.password)) errors.password = 'Must not be empty';

  if(Object.keys(errors).length > 0) return res.status(400).json(errors);

  firebase.auth().signInWithEmailAndPassword(user.email, user.password)
    .then(data => {
      return data.user.getIdToken();
    })
    .then(token => {
      return res.json({ token });
    })
    .catch(err => {
      console.error(err);
      if(err.code === 'auth/wrong-password') {
        return res.status(403).json({ general: 'Wrong credentials, please try again'});
      }
      return res.status(500).json({ error: err.code})
    })
})

exports.api = functions.https.onRequest(app);