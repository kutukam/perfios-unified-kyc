/* Prepared interaction values and copy taken from the supplied screen exports.
   Everything stays in memory; these are not credentials for a live service. */
window.JourneyContent = Object.freeze({
  values: {
    username: 'alokkumar', password: 'Alok@1234', karzaKey: 'P4tD8MeJ5AbsJR0q',
    firstName: 'Alok', lastName: 'Kumar', birthDate: '10/09/1985', gender: 'Male',
    mobile: '8172635410', email: 'alokkumar@gmail.com',
    currentAddress: '210, Mandal Das Bhuvan, Bori Bunder, Mumbai, Pincode - 324156',
    permanentAddress: '210, Mandal Das Bhuvan, Bori Bunder, Mumbai, Pincode - 324156',
    pan: 'BYPPL8716T', panBirthDate: '10/02/1997', otp: '603720'
  },
  applicationNumber: '398672035602957905',
  terms: [
    { text: 'By accessing or using this application, you agree to abide by these Terms and Conditions. Please read them carefully to understand your rights and responsibilities during this digital verification process.' },
    { title: 'Introduction', text: 'This application is designed to facilitate a seamless and secure Know Your Customer (KYC) verification process. Perfios provides innovative solutions to simplify KYC compliance, enabling businesses and users to verify identities through a streamlined, secure, and efficient digital journey.\nBy using this platform, you agree to participate in the digital KYC process as mandated by regulatory authorities. This includes, but is not limited to, document verification, liveness checks, and data validation procedures.' },
    { title: 'Key Terms', subtitle: 'User Consent', text: 'By proceeding with the KYC journey, you confirm that you voluntarily consent to provide the necessary details and documents for identity verification.' },
    { subtitle: 'Document Accuracy', text: 'Users must ensure that the documents uploaded during the KYC process are valid, accurate, and up to date. Any discrepancies may result in delays or rejection of the verification process.' },
    { subtitle: 'Data Privacy', text: 'Perfios is committed to protecting your personal data in compliance with applicable privacy laws. The information you provide will only be used for identity verification.' }
  ],
  instructions: [
    ['instruction-light.png', 'Quiet and Ample Light', 'Ensure you are sitting in a place where it’s quiet and has ample light around'],
    ['instruction-network.png', 'Good Internet Connectivity', 'Ensure you are connected to your home wifi or mobile data before starting the journey'],
    ['instruction-documents.png', 'Important Documents', 'Ensure you have your original PAN card and Aadhaar card handy']
  ],
  captureErrors: {
    'no-face': ['No face detected', 'Kindly ensure that your face is clearly seen in the photo'],
    'poor-quality': ['Poor image quality', 'Kindly ensure that your face is positioned as per screen guiding lines'],
    'not-live': ['Photo is not live', 'Kindly ensure that the image is clicked in real-time'],
    'multiple-faces': ['Multiple faces detected', 'Kindly ensure that only one face is seen in the photo'],
    'framing': ['Incorrect framing', 'Kindly ensure that your face is positioned as per screen guiding lines']
  },
  location: [
    ['Latitude','19.0115166'],['Longitude','72.7647643'],['Plus Code','2RH3+G65'],
    ['Area','Lower Parel'],['City','Mumbai'],['Pincode','400026'],['District','Mumbai City'],
    ['State','Maharashtra'],['Country','India'],['IP Address','103.240.13']
  ]
});
