const { json, send } = require('micro')
const { MoltinClient } = require('@moltin/request')
const {
  createClient: shipStationClient
} = require('@agnostack/shipstation-request')

const cors = require('micro-cors')({
  allowMethods: ['POST'],
  exposeHeaders: ['x-moltin-secret-key'],
  allowHeaders: [
    'x-moltin-secret-key',
    'x-forwarded-proto',
    'X-Requested-With',
    'Access-Control-Allow-Origin',
    'X-HTTP-Method-Override',
    'Content-Type',
    'Authorization',
    'Accept'
  ]
})

const {
  createShipment,
  createShipmentLabel,
  startTracking,
  defaultCodes
} = require('./utils')

const moltin = new MoltinClient({
  client_id: process.env.MOLTIN_CLIENT_ID,
  client_secret: process.env.MOLTIN_CLIENT_SECRET,
  application: 'demo-sync-moltin-to-shipengine'
})

const shipStation = new shipStationClient({
  public_key: process.env.SHIPSTATION_PUBLIC_KEY,
  secret_key: process.env.SHIPSTATION_SECRET_KEY
})

const _toJSON = error => {
  return !error
    ? ''
    : Object.getOwnPropertyNames(error).reduce(
        (jsonError, key) => {
          return { ...jsonError, [key]: error[key] }
        },
        { type: 'error' }
      )
}

const _toLowercase = string => {
  return !string ? '' : string.toLocaleLowerCase()
}

process.on('unhandledRejection', (reason, p) => {
  console.error(
    'Promise unhandledRejection: ',
    p,
    ', reason:',
    JSON.stringify(reason)
  )
})

module.exports = cors(async (req, res) => {
  if (req.method === 'OPTIONS') {
    return send(res, 204)
  }

  if (
    (await req.headers['x-moltin-secret-key']) !=
    process.env.MOLTIN_WEBHOOK_SECRET
  ) {
    return send(res, 401)
  }

  try {
    const { triggered_by, resources: body } = await json(req)

    const {
      data: { type: observable, id: observableId },
      included
    } = JSON.parse(body)

    const [type] = triggered_by.split('.')

    const shippingItem = included.items.find(orderItem =>
      _toLowercase(orderItem.name).startsWith('shipping')
    )

    if (
      type === 'order' &&
      observable === 'order' &&
      observableId &&
      shippingItem
    ) {
      const observed = await moltin.get(`${observable}s/${observableId}`)
      const {
        data: {
          payment: paymentStatus,
          shipping: shippingStatus,
          shipping_address: shippingAddress,
          customer: { email: customerEmail },
          meta: {
            timestamps: { created_at: orderDate }
          }
        }
      } = observed

      if (
        customerEmail &&
        paymentStatus === 'paid' &&
        shippingStatus !== 'fulfilled' &&
        shippingItem &&
        shippingAddress
      ) {
        const { carrierCode, orderStatus, serviceCode } = defaultCodes

        return createShipment({
          shipStation,
          orderNumber: observableId,
          orderDate,
          orderStatus,
          carrierCode,
          serviceCode,
          customerAddress: shippingAddress,
          shippingAddress
        })
          .then(shipment => {
            return createShipmentLabel({
              shipStation,
              shipment,
              testLabel: true
            })
              .then(({ trackingNumber }) => {
                const { orderId } = shipment
                return startTracking({
                  shipStation,
                  orderId,
                  carrierCode,
                  trackingNumber
                }).then(() => {
                  return send(
                    res,
                    200,
                    JSON.stringify({
                      received: true,
                      carrierCode,
                      serviceCode,
                      trackingNumber
                    })
                  )
                })
              })
              .catch(error => {
                console.log('error creating shipping label', error)
                const jsonError = _toJSON(error)
                return send(res, 500, jsonError)
              })
          })
          .catch(error => {
            console.log('error creating shipment')
            const jsonError = _toJSON(error)
            return send(res, 500, jsonError)
          })
      } else {
        console.error('missing customerEmail or sku (carrierId/serviceCode)')
        return send(
          res,
          200,
          JSON.stringify({ received: true, rateId: shippingItem.sku })
        )
      }
    } else {
      console.error('missing order_id')
      return send(res, 200, JSON.stringify({ received: true }))
    }
  } catch (error) {
    const jsonError = _toJSON(error)
    return send(res, 500, jsonError)
  }
})
