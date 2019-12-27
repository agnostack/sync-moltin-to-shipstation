const moment = require('moment-timezone')

const createShipment = ({
  shipStation,
  orderNumber,
  orderDate,
  orderStatus,
  carrierCode,
  serviceCode,
  customerAddress,
  shippingAddress
}) => {
  return new Promise((resolve, reject) => {
    const { type: packageCode, weight, dimensions } = _defaultParcel

    return shipStation
      .post('/orders/createorder', {
        orderNumber,
        orderDate: moment(new Date(orderDate)).format('MM-DD-YYYY'),
        orderStatus,
        carrierCode,
        serviceCode,
        billTo: _conformOrderAddress(customerAddress),
        shipTo: _conformOrderAddress(shippingAddress),
        packageCode,
        weight,
        dimensions
      })
      .then(shipment => {
        resolve(shipment)
      })
      .catch(error => {
        console.log('TCL: error', error)
        reject(error)
      })
  })
}

const createShipmentLabel = ({ shipStation, shipment, testLabel = true }) => {
  return new Promise((resolve, reject) => {
    const {
      orderId,
      createDate,
      carrierCode,
      serviceCode,
      confirmation
    } = shipment

    return shipStation
      .post('/orders/createlabelfororder', {
        orderId,
        carrierCode,
        serviceCode,
        confirmation,
        shipDate: createDate,
        testLabel
      })
      .then(data => {
        resolve(data)
      })
      .catch(error => reject(error))
  })
}

const startTracking = ({
  shipStation,
  orderId,
  carrierCode,
  trackingNumber
}) => {
  return new Promise((resolve, reject) => {
    return shipStation
      .post('/orders/markasshipped', {
        orderId,
        carrierCode,
        trackingNumber
      })
      .then(data => {
        resolve(data)
      })
      .catch(error => reject(error))
  })
}

// TODO: remove hardcode
const defaultCodes = {
  orderStatus: 'awaiting_shipment',
  carrierCode: 'stamps_com',
  serviceCode: 'usps_first_class_mail'
}

module.exports = {
  createShipment,
  createShipmentLabel,
  startTracking,
  defaultCodes
}

const _conformOrderAddress = address => {
  const {
    first_name,
    last_name,
    phone_number,
    line_1,
    city,
    county,
    postcode,
    country
  } = address
  return {
    name: `${first_name} ${last_name}`,
    street1: line_1,
    city,
    state: county,
    postalCode: postcode,
    country,
    phone: phone_number
  }
}

// TODO: remove hardcode
const _defaultParcel = {
  type: 'letter',
  weight: {
    value: 3,
    units: 'ounces',
    WeightUnits: 3
  },
  dimensions: {
    units: 'inches',
    length: 1,
    width: 1,
    height: 1
  }
}
