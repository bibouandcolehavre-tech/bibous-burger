// The restaurant does not seat guests on Sunday evenings. Keep tests that
// exercise table bookings valid on Saturdays too, without altering live rules.
const {parisDateKey}=require('../availability');
module.exports=function nextTableService(now=Date.now()){
  for(let days=1;days<=7;days++){
    const date=parisDateKey(new Date(now+days*86400000));
    if(new Date(date+'T12:00:00Z').getUTCDay()!==0)return date;
  }
  throw Error('No future table service date');
};
