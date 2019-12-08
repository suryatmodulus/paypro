const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp(functions.config().firebase);

let users = admin.firestore().collection('users')
let payments = admin.firestore().collection('payments');


exports.addUser = functions.https.onRequest((request, response) => {
	let data = request.body
	let timestamp = new Date()
	users.add({
	    phone: data.phone,
	    password: data.password,
	    upiId : data.upi_id,
	    balance: parseInt(data.balance) || 0,
	    timestamp: new Date(),
	})
	.then((docRef)=>{
		return response.send({status_code: 200, message: "User Added Successfully", data: {}})
	})
	.catch((error)=>{
	   return response.send({status_code: 400, message: error, data: {}})
	});
});


exports.addBalance = functions.https.onRequest((request, response) => {
	let data = request.body
	users.where('phone','==',data.phone).get()
	.then(querySnapshot => {
		querySnapshot.forEach(async documentSnapshot => {
			cur_balance = documentSnapshot.data().balance
			await users.doc(documentSnapshot.id).set({balance:(cur_balance + parseInt(data.amount))},{merge: true})
			return response.send({status_code: 400, message: "Balance Added Successfully", data: {balance : cur_balance + parseInt(data.amount) }})
		})
		return true
	})
	.catch((error)=>{
	   return response.send({status_code: 200, message: error, data: {}})
	});
});


exports.addPayments = functions.https.onRequest((request, response) => {
	let data = request.body
	payments.add({
	    from: data.from,
	    to: data.to,
	    amount : parseInt(data.amount),
	    isPaid: false,
	    priority: parseInt(data.priority),
	    timestamp: new Date(),
	})
	.then((docRef)=>{
		return response.send({status_code: 200, message: "Payment Added Successfully", data: {}})
	})
	.catch((error)=>{
	   return response.send({status_code: 400, message: error, data: {}})
	});
});

exports.initTransactionOnPaymentAdded = functions.firestore
    .document('payments/{paymentsId}')
    .onCreate(async (snap, context) => {
    	let data = snap.data()
 		await admin.firestore().collection('users').where('phone','==',data.from).get()
		.then(querySnapshot => {
			querySnapshot.forEach(async documentSnapshot => {
				let udata = documentSnapshot.data()
				if(udata.balance >= data.amount && data.priority === 1){
					await admin.firestore().collection('users').doc(documentSnapshot.id).set({balance:(udata.balance - data.amount)},{merge: true})
					await admin.firestore().collection('users').where('phone','==',data.to).get()
					.then(querySnapshot => {
						querySnapshot.forEach(async documentSnapshot => {
							cur_balance = documentSnapshot.data().balance
							await admin.firestore().collection('users').doc(documentSnapshot.id).set({balance:(cur_balance + data.amount)},{merge: true})
						})
						return true
					})
					.catch((error)=>{
						console.log(error)
					})
					await admin.firestore().collection('payments').doc(snap.id).set({isPaid: true},{merge: true})
				}
			});
			return true
		})
		.catch((error) =>{
			console.log(error)
		})
	return true
});


exports.initTransactionsOnBalanceAdded = functions.firestore
    .document('users/{usersId}')
    .onUpdate(async (snap, context) => {
    	const data = snap.after.data();
      	const previousData = snap.before.data();
      	let cur_balance = data.balance
      	let isPayable = true
      	if(cur_balance > previousData.balance){
      		await admin.firestore().collection('payments').where('from','==',data.phone).where('isPaid','==',false).orderBy('priority','asc').orderBy('amount','desc').orderBy('timestamp','desc').get()
			.then(querySnapshot => {
				querySnapshot.forEach(async documentSnapshot => {
					let pdata = documentSnapshot.data()
					if(cur_balance >= pdata.amount){
						await admin.firestore().collection('users').doc(snap.after.id).set({balance:(cur_balance - pdata.amount)},{merge: true})
						await admin.firestore().collection('users').where('phone','==',pdata.to).get()
						.then(querySnapshot => {
							querySnapshot.forEach(async doc => {
								balance = doc.data().balance
								await admin.firestore().collection('users').doc(doc.id).set({balance:(balance + pdata.amount)},{merge: true})
							})
							return true
						})
						.catch((error)=>{
							console.log(error)
						})
						await admin.firestore().collection('payments').doc(documentSnapshot.id).set({isPaid: true},{merge: true})
					}
				});
				return true
			})
			.catch((error) =>{
				console.log(error)
			})
      	}
	return true
});
