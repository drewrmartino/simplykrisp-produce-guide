// Representative grocery emails for parser tests. Wording is modelled on the
// structure of real retailer emails (item lines, quantities, refunds,
// substitutions, promo footers) but the content is invented.

export const instacartReceipt = {
  from: 'Instacart <orders@instacart.com>',
  subject: "Your order receipt from Smith's Food & Drug",
  text: `Here's your receipt
Order #18822734012
Delivered Tuesday, November 3

Items found
Organic Bananas
6 ct  $2.09
Honeycrisp Apples
2 lb  $5.98
Driscoll's Strawberries 16 oz
2 x $4.99
Organic Baby Spinach 5 oz
1 x $3.99
Broccoli Crowns
1.3 lb $2.58
Fresh Express Cilantro Bunch
1 x $0.99
Green Onions (Scallions) Bunch
1 x $0.89
Tropicana Pure Premium Orange Juice 52 oz
1 x $4.49
Lay's Classic Potato Chips
1 x $4.29
Simply Lemonade
1 x $3.49

Replacements
Romaine Hearts 3 ct replaced with Little Gem Lettuce 2 ct

Refunded
Organic Blueberries 6 oz — out of stock, refunded

Subtotal $41.27
Service fee $3.99
Delivery fee $3.99
Paid with Apple Pay
Download the app on the App Store`,
};

export const instacartConfirmation = {
  from: 'Instacart <orders@instacart.com>',
  subject: "Your Smith's order is confirmed",
  text: `Thanks for your order! Order #18822734012
Estimated total $44.10
Organic Bananas 6 ct
Honeycrisp Apples 2 lb
Driscoll's Strawberries 16 oz Qty: 2
Organic Blueberries 6 oz
Romaine Hearts 3 ct`,
};

export const walmartDelivered = {
  from: 'Walmart.com <help@walmart.com>',
  subject: 'Your order was delivered',
  html: `<html><body><table>
<tr><td>Order# 2000123-45678901</td></tr>
<tr><td>Fresh Hass Avocados, Each</td><td>Qty 4</td><td>$3.12</td></tr>
<tr><td>Fresh Yellow Onions, 3 lb Bag</td><td>Qty 1</td><td>$2.97</td></tr>
<tr><td>Marketside Fresh Butter Lettuce</td><td>Qty 1</td><td>$3.48</td></tr>
<tr><td>Great Value Frozen Broccoli Florets, 12 oz</td><td>Qty 2</td><td>$2.24</td></tr>
<tr><td>Fresh Cotton Candy Grapes, 2 lb</td><td>Qty 1</td><td>$5.97</td></tr>
<tr><td>Fresh Roma Tomatoes, Each</td><td>Qty 5</td><td>$1.20</td></tr>
<tr><td>Great Value Apple Juice 64 fl oz</td><td>Qty 1</td><td>$2.48</td></tr>
<tr><td>Fresh Russet Potatoes, 5 lb Bag</td><td>Qty 1</td><td>$3.47</td></tr>
<tr><td>Fresh Jalape&ntilde;o Peppers</td><td>Qty 3</td><td>$0.42</td></tr>
<tr><td>Dragon Fruit, Each</td><td>Qty 1</td><td>$3.98</td></tr>
</table><p>Privacy &amp; terms | Unsubscribe</p></body></html>`,
};

export const krogerPickup = {
  from: "Smith's <smiths@email.smithsfoodanddrug.com>",
  subject: 'Your Pickup order is complete',
  text: `Order Number: 112233445566
Simple Truth Organic Carrots 2 lb   1   $2.49
Kroger Celery Hearts               1   $2.99
Mini Sweet Peppers 1 lb            1   $3.99
Sugar Snap Peas 8 oz               1   $2.99
Zucchini Squash                    3   $2.37
Butternut Squash                   1   $3.12
Kroger Garlic Powder               1   $1.99
Fresh Corn on the Cob              4   $2.00
Cherry Tomatoes 10 oz              1   $2.99
Red Grapefruit                     2   $2.50`,
};

export const amazonFresh = {
  from: 'Amazon Fresh <shipment-tracking@amazon.com>',
  subject: 'Delivered: Your Amazon Fresh order',
  text: `Your package was delivered.
Order #112-1234567-1234567
Raspberries, 6 oz  Quantity: 2
Blackberries, 6 oz Quantity: 1
Organic Kale Bunch Quantity: 1
Lemons, 2 lb bag   Quantity: 1
Whole Foods Market Organic Hummus Quantity: 1
Cremini Mushrooms 8 oz Quantity: 1`,
};

export const gmailVerification = {
  from: 'Gmail Team <forwarding-noreply@google.com>',
  subject: '(#614229187) Gmail Forwarding Confirmation - Receive Mail from drew.test@gmail.com',
  text: `drew.test@gmail.com has requested to automatically forward mail to your email
address abc123+k7m2p9qx@inbound.postmarkapp.com.
Confirmation code: 614229187

To allow drew.test@gmail.com to automatically forward mail to your address,
please click the link below to confirm the request:

https://mail-settings.google.com/mail/vf-%5BANGjdJ8example%5D-abc123

If you click the link and it appears to be broken, please copy and paste it
into a new window.`,
};

export const manualForward = {
  from: 'Drew Tester <drew.test@gmail.com>',
  subject: 'Fwd: Your order from Harmons is on its way',
  text: `see below

---------- Forwarded message ---------
From: Harmons <orders@harmonsgrocery.com>
Date: Mon, Nov 2, 2026 at 4:12 PM
Subject: Your order from Harmons has been delivered
To: <drew.test@gmail.com>

Order #H-778812
Asparagus Bunch 1
Brussels Sprouts 1 lb 1
Pears, Bartlett 3
Peaches 4
Fresh Basil 1
Harmons Sourdough Bread 1`,
};

export const pastedReceipt = {
  text: `SPROUTS FARMERS MARKET
ORGANIC CAULIFLOWER        3.99
CUCUMBERS 2 @ 0.99         1.98
MANGO ATAULFO 3 @ 1.00     3.00
KIWI 6 FOR 3.00            3.00
GREEN BEANS 1.12 LB        2.23
EGGPLANT                   1.99
WATERMELON SEEDLESS        5.99
SUBTOTAL                  22.18`,
};
