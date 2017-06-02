/* global pm, wpcom_reblog, JSON */

var jetpackLikesWidgetQueue = [];
var jetpackLikesWidgetBatch = [];
var jetpackLikesMasterReady = false;

// Keeps track of loaded comment likes widget so we can unload them when they are scrolled out of view.
var jetpackCommentLikesLoadedWidgets = [];

function jetpackIsScrolledIntoView( element ) {
	var elementTop = element.getBoundingClientRect().top;
	var elementBottom = element.getBoundingClientRect().bottom;
	var lookAhead = 2000;
	var lookBehind = 1000;

	return ( elementTop + lookBehind >= 0 ) && ( elementBottom <= window.innerHeight + lookAhead );
}

function jetpackUnloadScrolledOutWidgets() {
	for ( var i = jetpackCommentLikesLoadedWidgets.length - 1; i >= 0; i-- ) {
		var currentWidgetIframe = jetpackCommentLikesLoadedWidgets[ i ];

		if ( ! jetpackIsScrolledIntoView( currentWidgetIframe ) ) {
			var $widgetWrapper = jQuery( currentWidgetIframe ).parent().parent();

			// Restore parent class to 'unloaded' so this widget can be picked up by queue manager again if needed.
			$widgetWrapper
				.removeClass( 'jetpack-likes-widget-loaded jetpack-likes-widget-loading' )
				.addClass( 'jetpack-likes-widget-unloaded' );

			// Bring back the loading placeholder into view.
			$widgetWrapper.children( '.comment-likes-widget-placeholder' ).fadeIn();

			// Remove it from the list of loaded widgets.
			jetpackCommentLikesLoadedWidgets.splice( i, 1 );

			// Remove comment like widget iFrame.
			jQuery( currentWidgetIframe ).remove();
		}
	}
}

function JetpackLikesPostMessage(message, target ) {
	if ( 'string' === typeof message ){
		try {
			message = JSON.parse( message );
		} catch(e) {
			return;
		}
	}

	pm( {
		target: target,
		type: 'likesMessage',
		data: message,
		origin: '*'
	} );
}

function JetpackLikesBatchHandler() {
	var requests = [];
	jQuery( 'div.jetpack-likes-widget-unloaded' ).each( function() {
		if ( jetpackLikesWidgetBatch.indexOf( this.id ) > -1 ) {
			return;
		}

		if ( ! jetpackIsScrolledIntoView( this ) ) {
			return;
		}

		jetpackLikesWidgetBatch.push( this.id );

		var regex = /like-(post|comment)-wrapper-(\d+)-(\d+)-(\w+)/,
			match = regex.exec( this.id ),
			info;

		if ( ! match || match.length !== 5 ) {
			return;
		}

		info = {
			blog_id: match[2],
			width:   this.width
		};

		if ( 'post' === match[1] ) {
			info.post_id = match[3];
		} else if ( 'comment' === match[1] ) {
			info.comment_id = match[3];
		}

		info.obj_id = match[4];

		requests.push( info );
	});

	if ( requests.length > 0 ) {
		JetpackLikesPostMessage( { event: 'initialBatch', requests: requests }, window.frames['likes-master'] );
	}
}

function JetpackLikesMessageListener( event, message ) {
	var allowedOrigin, $container, $list, offset, rowLength, height, scrollbarWidth;

	if ( 'undefined' === typeof event.event ) {
		return;
	}

	// We only allow messages from one origin
	allowedOrigin = window.location.protocol + '//widgets.wp.com';
	if ( allowedOrigin !== message.origin ) {
		return;
	}

	if ( 'masterReady' === event.event ) {
		jQuery( document ).ready( function() {
			jetpackLikesMasterReady = true;

			var stylesData = {
					event: 'injectStyles'
				},
				$sdTextColor = jQuery( '.sd-text-color' ),
				$sdLinkColor = jQuery( '.sd-link-color' );

			if ( jQuery( 'iframe.admin-bar-likes-widget' ).length > 0 ) {
				JetpackLikesPostMessage( { event: 'adminBarEnabled' }, window.frames[ 'likes-master' ] );

				stylesData.adminBarStyles = {
					background: jQuery( '#wpadminbar .quicklinks li#wp-admin-bar-wpl-like > a' ).css( 'background' ),
					isRtl: ( 'rtl' === jQuery( '#wpadminbar' ).css( 'direction' ) )
				};
			}

			if ( ! window.addEventListener ) {
				jQuery( '#wp-admin-bar-admin-bar-likes-widget' ).hide();
			}

			stylesData.textStyles = {
				color:          $sdTextColor.css( 'color' ),
				fontFamily:     $sdTextColor.css( 'font-family' ),
				fontSize:       $sdTextColor.css( 'font-size' ),
				direction:      $sdTextColor.css( 'direction' ),
				fontWeight:     $sdTextColor.css( 'font-weight' ),
				fontStyle:      $sdTextColor.css( 'font-style' ),
				textDecoration: $sdTextColor.css( 'text-decoration' )
			};

			stylesData.linkStyles = {
				color:          $sdLinkColor.css( 'color' ),
				fontFamily:     $sdLinkColor.css( 'font-family' ),
				fontSize:       $sdLinkColor.css( 'font-size' ),
				textDecoration: $sdLinkColor.css( 'text-decoration' ),
				fontWeight:     $sdLinkColor.css( 'font-weight' ),
				fontStyle:      $sdLinkColor.css( 'font-style' )
			};

			JetpackLikesPostMessage( stylesData, window.frames[ 'likes-master' ] );

			JetpackLikesBatchHandler();

			jQuery( document ).on( 'inview', 'div.jetpack-likes-widget-unloaded', function() {
				jetpackLikesWidgetQueue.push( this.id );
			} );
		} );
	}

	if ( 'showLikeWidget' === event.event ) {
		jQuery( '#' + event.id + ' .likes-widget-placeholder' ).fadeOut( 'fast' );
	}

	if ( 'showCommentLikeWidget' === event.event ) {
		jQuery( '#' + event.id + ' .likes-widget-placeholder' ).fadeOut( 'fast' );
	}

	if ( 'clickReblogFlair' === event.event ) {
		wpcom_reblog.toggle_reblog_box_flair( event.obj_id );
	}

	if ( 'showOtherGravatars' === event.event ) {
		$container = jQuery( '#likes-other-gravatars' );
		$list = $container.find( 'ul' );

		$container.hide();
		$list.html( '' );

		$container.find( '.likes-text span' ).text( event.total );

		jQuery.each( event.likers, function( i, liker ) {
			var element;

			if ( 'http' !== liker.profile_URL.substr( 0, 4 ) ) {
				// We only display gravatars with http or https schema
				return;
			}

			element = jQuery( '<li><a><img /></a></li>' );
			element.addClass( liker.css_class );

			element.find( 'a' ).
				attr({
					href: liker.profile_URL,
					rel: 'nofollow',
					target: '_parent'
				}).
				addClass( 'wpl-liker' );

			element.find( 'img' ).
				attr({
					src: liker.avatar_URL,
					alt: liker.name
				}).
				css({
					width: '30px',
					height: '30px',
					paddingRight: '3px'
				});

			$list.append( element );
		} );

		offset = jQuery( '[name=\'' + event.parent + '\']' ).offset();

		$container.css( 'left', offset.left + event.position.left - 10 + 'px' );
		$container.css( 'top', offset.top + event.position.top - 33 + 'px' );

		rowLength = Math.floor( event.width / 37 );
		height = ( Math.ceil( event.likers.length / rowLength ) * 37 ) + 13;
		if ( height > 204 ) {
			height = 204;
		}

		$container.css( 'height', height + 'px' );
		$container.css( 'width', rowLength * 37 - 7 + 'px' );

		$list.css( 'width', rowLength * 37 + 'px' );

		$container.fadeIn( 'slow' );

		scrollbarWidth = $list[0].offsetWidth - $list[0].clientWidth;
		if ( scrollbarWidth > 0 ) {
			$container.width( $container.width() + scrollbarWidth );
			$list.width( $list.width() + scrollbarWidth );
		}
	}
}

pm.bind( 'likesMessage', JetpackLikesMessageListener );

jQuery( document ).click( function( e ) {
	var $container = jQuery( '#likes-other-gravatars' );

	if ( $container.has( e.target ).length === 0 ) {
		$container.fadeOut( 'slow' );
	}
});

function JetpackLikesWidgetQueueHandler() {
	var $wrapper, wrapper, wrapperID, found;
	if ( ! jetpackLikesMasterReady ) {
		setTimeout( JetpackLikesWidgetQueueHandler, 500 );
		return;
	}

	// Restore widgets to initial unloaded state when they are scrolled out of view.
	jetpackUnloadScrolledOutWidgets();

	if ( jetpackLikesWidgetQueue.length > 0 ) {
		// We may have a widget that needs creating now
		found = false;
		while( jetpackLikesWidgetQueue.length > 0 ) {
			// Grab the first member of the queue that isn't already loading.
			wrapperID = jetpackLikesWidgetQueue.splice( 0, 1 )[0];
			if ( jQuery( '#' + wrapperID ).hasClass( 'jetpack-likes-widget-unloaded' ) ) {
				found = true;
				break;
			}
		}
		if ( ! found ) {
			return;
		}
	} else {
		var $unloadedWidgets = jQuery( 'div.jetpack-likes-widget-unloaded' );

		if ( $unloadedWidgets.length > 0 ) {
			// Get the next unloaded widget
			wrapper = $unloadedWidgets.first()[0];
			wrapperID = wrapper.id;

			// Bail if current widget wrapper is not scrolled into view.
			// We need this in order to prevent performance issues caused by loading all iFrames at once.
			if ( ! wrapperID || ! jetpackIsScrolledIntoView( wrapper ) ){
				// Everything is currently loaded
				return;
			}

			// Grab any unloaded widgets for a batch request
			JetpackLikesBatchHandler();
		}
	}

	if ( 'undefined' === typeof wrapperID ) {
		return;
	}

	$wrapper = jQuery( '#' + wrapperID );
	$wrapper.find( 'iframe' ).remove();

	var placeholder = $wrapper.find( '.likes-widget-placeholder' );
	if ( placeholder.hasClass( 'post-likes-widget-placeholder' ) ) {
		if ( $wrapper.hasClass( 'slim-likes-widget' ) ) {
			placeholder.after( '<iframe class="post-likes-widget jetpack-likes-widget" name="' + $wrapper.data( 'name' ) + '" height="22px" width="68px" frameBorder="0" scrolling="no" src="' + $wrapper.data( 'src' ) + '"></iframe>' );
		} else {
			placeholder.after( '<iframe class="post-likes-widget jetpack-likes-widget" name="' + $wrapper.data( 'name' ) + '" height="55px" width="100%" frameBorder="0" src="' + $wrapper.data( 'src' ) + '"></iframe>' );
		}
	} else if ( placeholder.hasClass( 'comment-likes-widget-placeholder' ) ) {
		var commentLikesFrame = document.createElement( 'iframe' );
		commentLikesFrame['class'] = 'comment-likes-widget-frame jetpack-likes-widget-frame';
		commentLikesFrame.name = $wrapper.data( 'name' );
		commentLikesFrame.height = '18px';
		commentLikesFrame.width = '200px';
		commentLikesFrame.frameBorder = '0';
		commentLikesFrame.scrolling = 'no';
		commentLikesFrame.src = $wrapper.data( 'src' );
		$wrapper.find( '.comment-like-feedback' ).after( commentLikesFrame );

		jetpackCommentLikesLoadedWidgets.push( commentLikesFrame );
	}

	$wrapper.removeClass( 'jetpack-likes-widget-unloaded' ).addClass( 'jetpack-likes-widget-loading' );

	$wrapper.find( 'iframe' ).load( function( e ) {
		var $iframe = jQuery( e.target );

		JetpackLikesPostMessage( { event: 'loadLikeWidget', name: $iframe.attr( 'name' ), width: $iframe.width() }, window.frames[ 'likes-master' ] );

		$wrapper.removeClass( 'jetpack-likes-widget-loading' ).addClass( 'jetpack-likes-widget-loaded' );

		if ( $wrapper.hasClass( 'slim-likes-widget' ) ) {
			$wrapper.find( 'iframe' ).Jetpack( 'resizeable' );
		}
	});
}
JetpackLikesWidgetQueueHandler();

var delayedExec = function( after, fn ) {
	var timer;
	return function() {
		timer && clearTimeout( timer );
		timer = setTimeout( fn, after );
	};
};

var onScrollStopped = delayedExec( 250, JetpackLikesWidgetQueueHandler );

window.addEventListener( 'scroll', onScrollStopped, true );
